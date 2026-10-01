import { SuperadminService } from './superadmin.service';

describe('SuperadminService tenant management', () => {
  const makeService = (tenant: { status: string; statusBeforeBlock?: string | null; isActive?: boolean; isActiveBeforeBlock?: boolean | null; trialEndsAt?: Date | null }) => {
    const update = jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'tenant-1', ...tenant, ...data }));
    const prisma = {
      superadminTransaction: jest.fn((operation: (db: never) => Promise<unknown>) => Promise.resolve(operation({
        tenant: { findUnique: jest.fn().mockResolvedValue(tenant), update },
      } as never))),
    };
    const gateway = { disconnectTenantStaff: jest.fn() };
    return { service: new SuperadminService(prisma as never, gateway as never), update, gateway };
  };

  it('restores a trial tenant status and active flag after unblocking', async () => {
    const first = makeService({ status: 'TRIAL', isActive: true });
    await first.service.setBlocked('tenant-1', true);
    expect(first.update.mock.calls[0]?.[0].data).toMatchObject({ status: 'BLOCKED', statusBeforeBlock: 'TRIAL', isActive: false, isActiveBeforeBlock: true });
    expect(first.gateway.disconnectTenantStaff).toHaveBeenCalledWith('tenant-1');

    const restored = makeService({ status: 'BLOCKED', statusBeforeBlock: 'TRIAL', isActive: false, isActiveBeforeBlock: true });
    await restored.service.setBlocked('tenant-1', false);
    expect(restored.update.mock.calls[0]?.[0].data).toMatchObject({ status: 'TRIAL', statusBeforeBlock: null, isActive: true, isActiveBeforeBlock: null });
  });

  it('keeps a manually inactive tenant inactive after unblocking', async () => {
    const blocked = makeService({ status: 'ACTIVE', isActive: false });
    await blocked.service.setBlocked('tenant-1', true);
    expect(blocked.update.mock.calls[0]?.[0].data).toMatchObject({ statusBeforeBlock: 'ACTIVE', isActiveBeforeBlock: false });

    const restored = makeService({ status: 'BLOCKED', statusBeforeBlock: 'ACTIVE', isActive: false, isActiveBeforeBlock: false });
    await restored.service.setBlocked('tenant-1', false);
    expect(restored.update.mock.calls[0]?.[0].data).toMatchObject({ status: 'ACTIVE', isActive: false, statusBeforeBlock: null, isActiveBeforeBlock: null });
  });

  it('extends an expired trial from now', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T12:00:00.000Z'));
    try {
      const { service, update } = makeService({ status: 'TRIAL', trialEndsAt: new Date('2026-08-01T12:00:00.000Z') });
      await service.extendTrial('tenant-1');
      expect(update.mock.calls[0]?.[0].data).toMatchObject({ trialEndsAt: new Date('2026-10-31T12:00:00.000Z') });
    } finally { jest.useRealTimers(); }
  });
});
