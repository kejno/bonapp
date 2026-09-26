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
  let service: IntegrationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    writes.length = 0;
    service = new IntegrationsService(prisma);
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

  it('does not clear a saved secret when the edit form submits an empty secret field', async () => {
    findUnique.mockResolvedValue({
      integrationSettings: { iiko: { apiKey: 'saved-secret' } },
    });
    await service.updateSettings('tenant-1', 'iiko', { apiKey: '' });

    const saved = writes[0] as {
      data: { integrationSettings: Record<string, unknown> };
    };
    expect(saved.data.integrationSettings).toMatchObject({ iiko: { apiKey: 'saved-secret' } });
  });

  it('rejects menu sync when the provider is not configured', async () => {
    findUnique.mockResolvedValue({ integrationSettings: null });

    await expect(service.syncMenu('tenant-1', 'iiko')).rejects.toThrow('Integration is not configured');
  });

  it('does not report success when no POS import adapter is available', async () => {
    findUnique.mockResolvedValue({
      integrationSettings: { iiko: { apiUrl: 'https://pos.example/health', apiKey: 'key' } },
    });

    await expect(service.syncMenu('tenant-1', 'iiko')).rejects.toThrow('import adapter is implemented');
  });

  it('does not send integration credentials to a tenant supplied host', async () => {
    const requestSpy = jest.mocked(https.request);
    const previousAllowlist = process.env.INTEGRATION_HEALTHCHECK_HOSTS;
    delete process.env.INTEGRATION_HEALTHCHECK_HOSTS;
    findUnique.mockResolvedValue({
      integrationSettings: {
        iiko: { apiUrl: 'https://attacker.example/health', apiKey: 'secret' },
      },
    });

    const result = await service.getStatus('tenant-1');

    expect(result.integrations.iiko.status).toBe('ConnectionFailed');
    expect(requestSpy).not.toHaveBeenCalled();
    if (previousAllowlist === undefined) delete process.env.INTEGRATION_HEALTHCHECK_HOSTS;
    else process.env.INTEGRATION_HEALTHCHECK_HOSTS = previousAllowlist;
  });
});
