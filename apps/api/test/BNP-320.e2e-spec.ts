import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { StorageService } from '../src/storage/storage.service';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.S3_ENDPOINT ??= 'http://localhost:9000';
process.env.S3_BUCKET ??= 'bonapp';
process.env.S3_ACCESS_KEY ??= 'test-key';
process.env.S3_SECRET_KEY ??= 'test-secret';

describe('BNP-320: POST /api/v1/admin/tenant/logo without authentication — 401', () => {
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

  it('returns 401 when no Authorization header is provided', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/tenant/logo')
      .field('tenantId', 'any-tenant')
      .attach('logo', Buffer.from('data'), { filename: 'logo.png', contentType: 'image/png' });

    expect(response.status).toBe(401);
  });

  it('returns 401 when Authorization header is an empty string', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/tenant/logo')
      .set('Authorization', '')
      .field('tenantId', 'any-tenant')
      .attach('logo', Buffer.from('data'), { filename: 'logo.png', contentType: 'image/png' });

    expect(response.status).toBe(401);
  });
});
