import { IntegrationsService } from './integrations.service';
import { PrismaService } from '../prisma/prisma.service';
import * as https from 'node:https';

jest.mock('node:https', () => {
  const actual = jest.requireActual<typeof import('node:https')>('node:https');
  return { ...actual, request: jest.fn(actual.request) };
});

describe('IntegrationsService', () => {
  const findUnique = jest.fn();
  const writes: unknown[] = [];
  const update = jest.fn((args: unknown) => { writes.push(args); return Promise.resolve({}); });
  const forTenant = jest.fn(() => ({ tenant: { findUnique, update } }));
  const prisma = {
    forTenant,
  } as unknown as PrismaService;
  const startImport = jest.fn();
  const onboarding = { startImport } as never;
  let service: IntegrationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    writes.length = 0;
    service = new IntegrationsService(prisma, onboarding);
  });

  it('returns all integrations as not configured for an empty settings record', async () => {
    findUnique.mockResolvedValue({ integrationSettings: null });

    const result = await service.getStatus('tenant-1');

    expect(Object.values(result.integrations)).toHaveLength(6);
    expect(Object.values(result.integrations).every(({ status }) => status === 'NotConfigured')).toBe(true);
  });

  it('keeps settings tenant scoped and merges only the selected integration', async () => {
    findUnique.mockResolvedValue({
      integrationSettings: { erip: { serviceId: 'existing' } },
    });
    await service.updateSettings('tenant-1', 'bePaid', { shopId: 'shop-1' });

    expect(forTenant).toHaveBeenCalledWith('tenant-1');
    const saved = writes[0] as {
      where: { id: string };
      data: { integrationSettings: Record<string, unknown> };
    };
    expect(saved.where).toEqual({ id: 'tenant-1' });
    expect(saved.data.integrationSettings).toMatchObject({
      erip: { serviceId: 'existing' },
      bePaid: { shopId: 'shop-1' },
    });
  });

  it('stores r_keeper credentials in the fields used by the POS import', async () => {
    findUnique.mockResolvedValue({ integrationSettings: { iiko: { apiKey: 'old-key' } } });
    await service.updateSettings('tenant-1', 'r_keeper', {
      apiUrl: 'https://keeper.example', apiKey: 'keeper-key',
    });

    const saved = writes[0] as { data: Record<string, unknown> };
    expect(saved.data).toMatchObject({
      posType: 'r_keeper', posUrl: 'https://keeper.example', posApiKey: 'keeper-key',
      integrationSettings: { iiko: {}, r_keeper: { apiUrl: 'https://keeper.example', apiKey: 'keeper-key' } },
    });
  });

  it('does not clear a saved payment secret when the edit form submits an empty secret field', async () => {
    findUnique.mockResolvedValue({
      integrationSettings: { bePaid: { secretKey: 'saved-secret' } },
    });
    await service.updateSettings('tenant-1', 'bePaid', { secretKey: '' });

    const saved = writes[0] as {
      data: { integrationSettings: Record<string, unknown> };
    };
    expect(saved.data.integrationSettings).toMatchObject({ bePaid: { secretKey: 'saved-secret' } });
  });

  it('starts the existing POS import for the requested provider', async () => {
    startImport.mockResolvedValue({ jobId: 'job-1' });

    await expect(service.syncMenu('tenant-1', 'iiko')).resolves.toEqual({ jobId: 'job-1' });
    expect(startImport).toHaveBeenCalledWith('iiko');
  });

  it('does not send integration credentials to a tenant supplied host', async () => {
    const requestSpy = jest.mocked(https.request);
    const previousAllowlist = process.env.INTEGRATION_HEALTHCHECK_HOSTS;
    delete process.env.INTEGRATION_HEALTHCHECK_HOSTS;
    findUnique.mockResolvedValue({
      integrationSettings: {
        iiko: {
          apiUrl: 'https://attacker.example/health', apiKey: 'secret', appId: 'app',
          clientSecret: 'client-secret', organizationId: 'org', terminalGroupId: 'terminal',
        },
      },
    });

    const result = await service.getStatus('tenant-1');

    expect(result.integrations.iiko.status).toBe('ConnectionFailed');
    expect(requestSpy).not.toHaveBeenCalled();
    if (previousAllowlist === undefined) delete process.env.INTEGRATION_HEALTHCHECK_HOSTS;
    else process.env.INTEGRATION_HEALTHCHECK_HOSTS = previousAllowlist;
  });
});
