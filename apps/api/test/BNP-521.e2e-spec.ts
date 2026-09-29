import { EventEmitter } from 'node:events';
import * as dns from 'node:dns/promises';
import * as https from 'node:https';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminRoleGuard } from '../src/auth/admin-role.guard';
import { AuthGuard } from '../src/auth/auth.guard';
import { TenantContextGuard } from '../src/auth/tenant-context.guard';
import { IntegrationsController } from '../src/integrations/integrations.controller';
import { IntegrationsService } from '../src/integrations/integrations.service';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('node:https', () => {
  const actual = jest.requireActual<typeof import('node:https')>('node:https');
  return { ...actual, request: jest.fn() };
});

describe('BNP-521: health-check r_keeper (e2e)', () => {
  let app: INestApplication;
  const findUnique = jest.fn();
  const httpsRequest = https.request as jest.Mock;

  beforeAll(async () => {
    process.env.INTEGRATION_HEALTHCHECK_HOSTS = 'keeper.example';
    const prisma = { forTenant: () => ({ tenant: { findUnique } }) } as never;
    const service = new IntegrationsService(prisma, { startImport: jest.fn() } as never);
    const module = await Test.createTestingModule({
      controllers: [IntegrationsController],
      providers: [{ provide: IntegrationsService, useValue: service }],
    })
      .overrideGuard(AuthGuard).useValue({ canActivate: true })
      .overrideGuard(TenantContextGuard).useValue({ canActivate: true })
      .overrideGuard(AdminRoleGuard).useValue({ canActivate: true })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use((req: { user?: { tenantId: string; role: string } }, _res: unknown, next: () => void) => {
      req.user = { tenantId: 'tenant-521', role: 'ADMIN' };
      next();
    });
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (dns.lookup as jest.Mock).mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    findUnique.mockResolvedValue({ integrationSettings: {
      r_keeper: { apiUrl: 'https://keeper.example/health', apiKey: 'test-key' },
    } });
    httpsRequest.mockImplementation((options: https.RequestOptions, callback: unknown) => {
      const outgoing = new EventEmitter() as EventEmitter & { end: () => void; destroy: jest.Mock };
      outgoing.destroy = jest.fn();
      outgoing.end = () => setTimeout(() => {
        const response = new EventEmitter() as EventEmitter & { statusCode: number; resume: jest.Mock };
        response.statusCode = 204;
        response.resume = jest.fn();
        (callback as (res: EventEmitter & { statusCode: number; resume: jest.Mock }) => void)(response);
      }, 30);
      return Object.assign(outgoing, { requestOptions: options });
    });
  });

  afterAll(async () => {
    await app.close();
    delete process.env.INTEGRATION_HEALTHCHECK_HOSTS;
  });

  it('returns the actual r_keeper ping result from the status endpoint', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/integrations/status')
      .expect(200);

    const requestCalls = httpsRequest.mock.calls as unknown as Array<[https.RequestOptions]>;
    const requestOptions = requestCalls[0]?.[0];
    const body = response.body as {
      integrations: { r_keeper: { status: string; pingMs: number } };
    };
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'tenant-521' } }));
    expect(dns.lookup).toHaveBeenCalledWith('keeper.example', { all: true, verbatim: true });
    expect(httpsRequest).toHaveBeenCalledTimes(1);
    expect(requestOptions).toMatchObject({ hostname: '8.8.8.8', path: '/health', method: 'GET' });
    expect(requestOptions.headers).toMatchObject({ Host: 'keeper.example', Authorization: 'Bearer test-key' });
    expect(body.integrations.r_keeper.status).toBe('Online');
    expect(body.integrations.r_keeper.pingMs).toBeGreaterThanOrEqual(20);
  });
});
