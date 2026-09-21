import { TenantContextService } from './tenant-context.service';

describe('TenantContextService', () => {
  let service: TenantContextService;

  beforeEach(() => {
    service = new TenantContextService();
  });

  it('returns undefined outside of a run context', () => {
    expect(service.getTenantId()).toBeUndefined();
  });

  it('returns tenantId inside run context', () => {
    service.run('tenant-a', () => {
      expect(service.getTenantId()).toBe('tenant-a');
    });
  });

  it('restores undefined after run context exits', () => {
    service.run('tenant-a', () => {});
    expect(service.getTenantId()).toBeUndefined();
  });

  it('isolates context between concurrent async runs', async () => {
    const results: string[] = [];

    await Promise.all([
      service.run('tenant-a', () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            results.push(service.getTenantId() ?? 'none');
            resolve();
          }, 20),
        ),
      ),
      service.run('tenant-b', () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            results.push(service.getTenantId() ?? 'none');
            resolve();
          }, 5),
        ),
      ),
    ]);

    expect(results).toContain('tenant-a');
    expect(results).toContain('tenant-b');
    expect(results).not.toContain('none');
  });
});
