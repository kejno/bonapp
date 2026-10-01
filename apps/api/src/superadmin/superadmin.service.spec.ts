import { SuperadminService } from './superadmin.service';

describe('SuperadminService tenant management', () => {
  const makeService = (tenant: { status: string; statusBeforeBlock?: string | null; trialEndsAt?: Date | null }) => {
    const update = jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'tenant-1', ...tenant, ...data }));
    const prisma = {
      superadminTransaction: jest.fn((operation: (db: never) => Promise<unknown>) => Promise.resolve(operation({
        tenant: {
          findUnique: jest.fn().mockResolvedValue(tenant),
          update,
        },
      } as never))),
    };
    const gateway = { disconnectTenantStaff: jest.fn() };
    return { service: new SuperadminService(prisma as never, gateway as never), update, gateway };
  };

  it('restores a trial tenant after it is blocked and unblocked', async () => {
    const { service, update, gateway } = makeService({ status: 'TRIAL' });
    await service.setBlocked('tenant-1', true);
    expect(update.mock.calls[0]?.[0].data).toMatchObject({ status: 'BLOCKED', statusBeforeBlock: 'TRIAL' });
    expect(gateway.disconnectTenantStaff).toHaveBeenCalledWith('tenant-1');

    const blocked = { status: 'BLOCKED', statusBeforeBlock: 'TRIAL' };
    const restored = makeService(blocked);
    await restored.service.setBlocked('tenant-1', false);
    expect(restored.update.mock.calls[0]?.[0].data).toMatchObject({ status: 'TRIAL', statusBeforeBlock: null });
  });

  it('extends an expired trial from now', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T12:00:00.000Z'));
    const { service, update } = makeService({ status: 'TRIAL', trialEndsAt: new Date('2026-08-01T12:00:00.000Z') });
    await service.extendTrial('tenant-1');
    expect(update.mock.calls[0]?.[0].data).toMatchObject({ trialEndsAt: new Date('2026-10-31T12:00:00.000Z') });
    jest.useRealTimers();
  });
});
