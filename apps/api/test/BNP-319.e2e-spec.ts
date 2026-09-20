import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { StorageService } from '../src/storage/storage.service';
import { PrismaService } from '../src/prisma/prisma.service';

// NestJS v11 FileTypeValidator uses a dynamic `import('file-type')` (ESM-only package)
// via the `load-esm` helper. In Jest's synchronous VM environment that dynamic import
// throws ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING, causing every upload to fail with 400.
// We replace `load-esm` with a mock that detects common magic-byte signatures so the
// validator works correctly in test without needing --experimental-vm-modules.
jest.mock('load-esm', () => ({
  loadEsm: async (_module: string) => ({
    fileTypeFromBuffer: async (buffer: Buffer) => {
      if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return { mime: 'image/png', ext: 'png' };
      }
      if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return { mime: 'image/jpeg', ext: 'jpg' };
      }
      if (
        buffer.length >= 12 &&
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
      ) {
        return { mime: 'image/webp', ext: 'webp' };
      }
      return null;
    },
  }),
}));

process.env.S3_ENDPOINT ??= 'http://localhost:9000';
process.env.S3_BUCKET ??= 'bonapp';
process.env.S3_ACCESS_KEY ??= 'test-key';
process.env.S3_SECRET_KEY ??= 'test-secret';

const TENANT_ID = 'tenant-uuid-319';
const LOGO_URL = `http://localhost:9000/bonapp/tenants/${TENANT_ID}/logo.png`;

// Minimal valid PNG magic bytes (8-byte signature + minimal IHDR stub)
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
// Minimal valid JPEG magic bytes
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

describe('BNP-319: POST /api/v1/admin/tenant/logo — file saved and public URL returned', () => {
  let app: INestApplication<App>;
  let mockUpload: jest.Mock;

  beforeEach(async () => {
    mockUpload = jest.fn().mockResolvedValue(LOGO_URL);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue({ upload: mockUpload })
      .overrideProvider(PrismaService)
      .useValue({
        tenant: {
          findUnique: jest.fn().mockResolvedValue({ id: TENANT_ID, name: 'Test Tenant' }),
          update: jest.fn().mockResolvedValue({ id: TENANT_ID, logoUrl: LOGO_URL }),
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 201 with logoUrl when a valid PNG is uploaded', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/tenant/logo')
      .set('Authorization', 'Bearer test-token')
      .field('tenantId', TENANT_ID)
      .attach('logo', PNG_MAGIC, { filename: 'logo.png', contentType: 'image/png' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ logoUrl: LOGO_URL });
  });

  it('calls StorageService.upload with the correct key, buffer, and mimetype', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/tenant/logo')
      .set('Authorization', 'Bearer test-token')
      .field('tenantId', TENANT_ID)
      .attach('logo', PNG_MAGIC, { filename: 'logo.png', contentType: 'image/png' });

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledWith(
      `tenants/${TENANT_ID}/logo.png`,
      expect.any(Buffer),
      'image/png',
    );
  });

  it('accepts image/jpeg and derives the .jpg key extension', async () => {
    const jpegUrl = `http://localhost:9000/bonapp/tenants/${TENANT_ID}/logo.jpg`;
    mockUpload.mockResolvedValue(jpegUrl);

    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/tenant/logo')
      .set('Authorization', 'Bearer test-token')
      .field('tenantId', TENANT_ID)
      .attach('logo', JPEG_MAGIC, { filename: 'logo.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(201);
    expect(response.body.logoUrl).toBe(jpegUrl);
    expect(mockUpload).toHaveBeenCalledWith(
      `tenants/${TENANT_ID}/logo.jpg`,
      expect.any(Buffer),
      'image/jpeg',
    );
  });

  it('returns 400 when tenantId field is missing', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/tenant/logo')
      .set('Authorization', 'Bearer test-token')
      .attach('logo', PNG_MAGIC, { filename: 'logo.png', contentType: 'image/png' });

    expect(response.status).toBe(400);
  });
});
