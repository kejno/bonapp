import { IntegrationsService } from './integrations.service';

describe('BNP-518: r_keeper menu import', () => {
  it('dispatches the menu import to the r_keeper provider', async () => {
    const startImport = jest.fn().mockResolvedValue({ jobId: 'menu-job-518' });
    const service = new IntegrationsService({} as never, { startImport } as never);

    await expect(service.syncMenu('tenant-518', 'r_keeper')).resolves.toEqual({ jobId: 'menu-job-518' });
    expect(startImport).toHaveBeenCalledWith('r_keeper');
  });
});
