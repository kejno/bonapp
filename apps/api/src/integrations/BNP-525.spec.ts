import { IntegrationsService } from './integrations.service';
import { PrismaService } from '../prisma/prisma.service';

describe('BNP-525: integration status health check', () => {
  it('returns current status for every integration after reading tenant settings', async () => {
    const findUnique = jest.fn().mockResolvedValue({ integrationSettings: {
      iiko: { apiUrl: 'https://iiko.test', apiKey: 'key', appId: 'app', clientSecret: 'secret', organizationId: 'org', terminalGroupId: 'group' },
      oplati: { merchantId: 'merchant', apiKey: 'secret' }, erip: { serviceId: 'service' }, bePaid: { shopId: 'shop', mode: 'Test', secretKey: 'secret' },
    } });
    const service = new IntegrationsService({ forTenant: () => ({ tenant: { findUnique } }) } as unknown as PrismaService, {} as never);
    const response = await service.getStatus('tenant-525');
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'tenant-525' }, select: { integrationSettings: true } });
    expect(Object.keys(response.integrations)).toEqual(['iiko', 'r_keeper', 'oplati', 'erip', 'bePaid', 'skno']);
    expect(response.integrations.iiko.status).toBe('ConnectionFailed');
    expect(response.integrations.r_keeper.status).toBe('NotConfigured');
    expect(response.integrations.oplati.status).toBe('Active');
    expect(response.integrations.erip.status).toBe('Active');
    expect(response.integrations.bePaid.status).toBe('Active');
    expect(response.integrations.skno.status).toBe('NotConfigured');
  });
});
