import { IntegrationsService } from './integrations.service';

describe('BNP-521: health-check r_keeper', () => {
  it('exposes the ping result in the integration status response', async () => {
    const prisma = {
      forTenant: () => ({
        tenant: { findUnique: jest.fn().mockResolvedValue({
          integrationSettings: { r_keeper: { apiUrl: 'https://keeper.example', apiKey: 'secret' } },
        }) },
      }),
    } as never;
    const service = new IntegrationsService(prisma, { startImport: jest.fn() } as never);
    jest.spyOn(service as never, 'checkHttp').mockResolvedValue({ status: 'Online', pingMs: 23 } as never);

    const result = await service.getStatus('tenant-521');

    expect(result.integrations.r_keeper).toMatchObject({ status: 'Online', pingMs: 23 });
  });
});
