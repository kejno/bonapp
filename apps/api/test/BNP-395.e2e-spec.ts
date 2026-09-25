import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { TenantContextGuard } from '../src/auth/tenant-context.guard';
import { HallsService } from '../src/halls/halls.service';
import { TableQrPdfService } from '../src/halls/table-qr-pdf.service';
import { TablesController } from '../src/halls/tables.controller';
import { PrismaService } from '../src/prisma/prisma.service';

describe('BNP-395: unauthorized PDF generation', () => {
  let app: INestApplication;
  const generate = jest.fn();
  const jwtSecret = 'test-jwt-secret';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TablesController],
      providers: [
        { provide: HallsService, useValue: {} },
        { provide: TableQrPdfService, useValue: { generate } },
        { provide: ConfigService, useValue: { getOrThrow: () => jwtSecret } },
        {
          provide: PrismaService,
          useValue: {
            forTenant: () => ({
              user: {
                findFirst: jest
                  .fn()
                  .mockResolvedValue({
                    isActive: true,
                    isBlocked: false,
                    role: 'WAITER',
                    sessionVersion: 0,
                  }),
              },
            }),
          },
        },
      ],
    })
      .overrideGuard(TenantContextGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => app?.close());

  function createWaiterToken(): string {
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        tenantId: 'tenant-1',
        userId: 'waiter-1',
        role: 'WAITER',
        type: 'access',
        sessionVersion: 0,
      }),
    ).toString('base64url');
    const data = `${header}.${payload}`;
    return `${data}.${createHmac('sha256', jwtSecret).update(data).digest('base64url')}`;
  }

  it('rejects a request without a token with 401 and does not generate a PDF', async () => {
    await request(app.getHttpServer() as never)
      .post('/api/v1/admin/tables/generate-qr-pdf')
      .send({})
      .expect(401);
    expect(generate).not.toHaveBeenCalled();
  });

  it('denies an authenticated staff member without administrator rights with 403', async () => {
    await request(app.getHttpServer() as never)
      .post('/api/v1/admin/tables/generate-qr-pdf')
      .set('Authorization', `Bearer ${createWaiterToken()}`)
      .send({})
      .expect(403);
    expect(generate).not.toHaveBeenCalled();
  });
});
