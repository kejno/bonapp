import { isPosOrderEligible, recoverPendingPosOrders } from './pos-order-recovery';
import { PrismaService } from '../prisma/prisma.service';

describe('recoverPendingPosOrders', () => {
  it('allows only unpaid orders that remain active', () => {
    expect(isPosOrderEligible('NEW', false)).toBe(true);
    expect(isPosOrderEligible('CANCELLED', false)).toBe(false);
    expect(isPosOrderEligible('PAID', false)).toBe(false);
    expect(isPosOrderEligible('SERVED', true)).toBe(false);
  });

  it('requeues persisted guest orders on a later pass after the queue was unavailable', async () => {
    const persisted = [{ id: 'order-1' }, { id: 'order-2' }];
    const store = {
      db: { tenant: { findMany: jest.fn().mockResolvedValue([{ id: 'tenant-1' }]) } },
      forTenant: jest.fn(() => ({ order: { findMany: jest.fn().mockResolvedValue(persisted) } })),
    };
    const enqueue = jest.fn().mockRejectedValueOnce(new Error('Redis unavailable')).mockResolvedValue(undefined);

    await expect(recoverPendingPosOrders(store as unknown as PrismaService, enqueue)).rejects.toThrow('Redis unavailable');
    await recoverPendingPosOrders(store as unknown as PrismaService, enqueue);

    expect(enqueue).toHaveBeenNthCalledWith(1, 'tenant-1', 'order-1');
    expect(enqueue).toHaveBeenNthCalledWith(2, 'tenant-1', 'order-1');
    expect(enqueue).toHaveBeenNthCalledWith(3, 'tenant-1', 'order-2');
  });
});
