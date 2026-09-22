import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/storage/storage.service';

jest.mock('load-esm', () => ({
  loadEsm: () => ({
    fileTypeFromBuffer: () => ({ mime: 'image/png', ext: 'png' }),
  }),
}));

const tenantA = 'bnp337-tenant-a';
const tenantB = 'bnp337-tenant-b';
const jwtSecret = 'bnp337-test-secret';

function jwt(tenantId: string) {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ tenantId, exp: Math.floor(Date.now() / 1000) + 60 }),
  ).toString('base64url');
  const signature = createHmac('sha256', jwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

describe('BNP-337: a JWT from tenant A cannot open a tenant B resource', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET = jwtSecret;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        db: { tenant: { findUnique: jest.fn().mockResolvedValue(null) } },
      })
      .overrideProvider(StorageService)
      .useValue({ upload: jest.fn() })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns 404 and does not disclose tenant B data', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/tenant/logo')
      .set('Authorization', `Bearer ${jwt(tenantA)}`)
      .field('tenantId', tenantB)
      .attach(
        'logo',
        Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x0d,
        ]),
        {
          filename: 'logo.png',
          contentType: 'image/png',
        },
      );

    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain(tenantB);
  });
});
