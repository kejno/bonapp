import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { StorageService } from '../src/storage/storage.service';
import { PrismaService } from '../src/prisma/prisma.service';

// Mock load-esm so NestJS FileTypeValidator can perform magic-bytes validation
// in Jest's synchronous VM environment (without --experimental-vm-modules).
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
      // PDF: %PDF
      if (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
        return { mime: 'application/pdf', ext: 'pdf' };
      }
      // GIF: GIF8
      if (buffer.length >= 4 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
        return { mime: 'image/gif', ext: 'gif' };
      }
      return null;
    },
  }),
}));

process.env.S3_ENDPOINT ??= 'http://localhost:9000';
process.env.S3_BUCKET ??= 'bonapp';
process.env.S3_ACCESS_KEY ??= 'test-key';
process.env.S3_SECRET_KEY ??= 'test-secret';

describe('BNP-321: POST /api/v1/admin/tenant/logo with invalid file type — 400', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue({ upload: jest.fn() })
      .overrideProvider(PrismaService)
      .useValue({
        tenant: {
          findUnique: jest.fn(),
          update: jest.fn(),
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

  it('returns 400 when a text/plain file is uploaded', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/tenant/logo')
      .set('Authorization', 'Bearer test-token')
      .field('tenantId', 'tenant-uuid')
      .attach('logo', Buffer.from('not an image content'), {
        filename: 'file.txt',
        contentType: 'text/plain',
      });

    expect(response.status).toBe(400);
  });

  it('returns 400 when application/pdf is uploaded (PDF magic bytes: %PDF)', async () => {
    const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/tenant/logo')
      .set('Authorization', 'Bearer test-token')
      .field('tenantId', 'tenant-uuid')
      .attach('logo', pdfBuffer, {
        filename: 'document.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(400);
  });

  it('returns 400 when image/gif is uploaded (gif is not in allowed list)', async () => {
    const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/tenant/logo')
      .set('Authorization', 'Bearer test-token')
      .field('tenantId', 'tenant-uuid')
      .attach('logo', gifBuffer, {
        filename: 'animation.gif',
        contentType: 'image/gif',
      });

    expect(response.status).toBe(400);
  });
});
