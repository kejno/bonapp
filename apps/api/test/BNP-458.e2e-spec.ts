import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { AuthGuard } from '../src/auth/auth.guard';
import { AdminRoleGuard } from '../src/auth/admin-role.guard';
import { TenantContextGuard } from '../src/auth/tenant-context.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantController } from '../src/tenant/tenant.controller';
import { TenantService } from '../src/tenant/tenant.service';
import { MenuGateway } from '../src/menu/menu.gateway';

describe('BNP-458: payment gateway authorization', () => {
  let app: INestApplication;
  const jwtSecret = 'bnp-458-test-jwt-secret';
  const getStatuses = jest.fn().mockResolvedValue({ oplati: true, erip: false, bepaid: false, skno: false });
  const saveCredentials = jest.fn().mockResolvedValue({ oplati: true, erip: false, bepaid: false, skno: false });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TenantController],
      providers: [
        { provide: TenantService, useValue: { getPaymentGatewayStatuses: getStatuses, savePaymentCredentials: saveCredentials } },
        { provide: MenuGateway, useValue: {} },
        { provide: ConfigService, useValue: { getOrThrow: () => jwtSecret } },
        AuthGuard,
        AdminRoleGuard,
        {
          provide: PrismaService,
          useValue: {
            forTenant: () => ({ user: { findFirst: jest.fn().mockResolvedValue({ isActive: true, isBlocked: false, role: 'WAITER', sessionVersion: 0 }) } }),
          },
        },
      ],
    })
      .overrideGuard(TenantContextGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => app?.close());

  function createWaiterToken(): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ tenantId: 'tenant-1', userId: 'waiter-1', role: 'WAITER', type: 'access', sessionVersion: 0 })).toString('base64url');
    const data = `${header}.${payload}`;
    return `${data}.${createHmac('sha256', jwtSecret).update(data).digest('base64url')}`;
  }

  beforeEach(() => {
    getStatuses.mockClear();
    saveCredentials.mockClear();
  });

  it('rejects unauthenticated status reads without revealing credentials', async () => {
    await request(app.getHttpServer() as never)
      .get('/api/v1/admin/tenant/onboarding/step3/payments')
      .expect(401);
    expect(getStatuses).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated credential write without saving credentials', async () => {
    const credentials = { gateway: 'oplati', merchantId: 'anonymous-test-merchant', secret: 'anonymous-test-secret' };

    await request(app.getHttpServer() as never)
      .put('/api/v1/admin/tenant/onboarding/step3/payments')
      .send(credentials)
      .expect(401);

    expect(saveCredentials).not.toHaveBeenCalled();
  });

  it('rejects an authenticated non-admin read and write without changing credentials', async () => {
    const token = `Bearer ${createWaiterToken()}`;
    await request(app.getHttpServer() as never)
      .get('/api/v1/admin/tenant/onboarding/step3/payments')
      .set('Authorization', token)
      .expect(403);
    await request(app.getHttpServer() as never)
      .put('/api/v1/admin/tenant/onboarding/step3/payments')
      .set('Authorization', token)
      .send({ gateway: 'oplati', merchantId: 'must-not-be-saved' })
      .expect(403);
    expect(getStatuses).not.toHaveBeenCalled();
    expect(saveCredentials).not.toHaveBeenCalled();
  });
});
