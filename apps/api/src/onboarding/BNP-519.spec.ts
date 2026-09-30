import { GuestSessionService } from '../guest-session/guest-session.service';
import { PosOrderQueueService } from './pos-order-queue.service';
import * as posNetwork from './pos-network';
import * as recovery from './pos-order-recovery';

const mockQueueAdd = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: jest.fn(),
  })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn(), waitUntilReady: jest.fn() })),
}));

jest.mock('./pos-network', () => ({ requestPosOrder: jest.fn() }));
jest.mock('./pos-order-recovery', () => ({
  claimPosOrderSubmission: jest.fn(),
  submitClaimedPosOrder: jest.fn((_prisma: unknown, _tenantId: string, _orderId: string, submit: () => Promise<string>) => submit()),
  isPosOrderEligible: jest.requireActual<typeof import('./pos-order-recovery')>('./pos-order-recovery').isPosOrderEligible,
  recoverPendingPosOrders: jest.fn(),
}));

describe('BNP-519: submit a guest order to r_keeper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueueAdd.mockResolvedValue(undefined);
  });

  it('creates and enqueues the guest order, then saves its POS order ID after processing', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const order = {
      id: 'order-519', dailyOrderNumber: 19, comment: 'Без лука', totalAmountByn: 12.5,
      posOrderId: null as string | null, posOrderSubmittedAt: null, status: 'NEW', isPaid: false,
      createdAt: new Date('2026-09-29T12:00:00.000Z'),
      items: [{ itemId: 'menu-519', quantity: 2, unitPriceByn: 6.25 }],
    };
    const orderCreate = jest.fn().mockImplementation(({ data }: { data: { dailyOrderNumber: number; status: string; totalAmountByn: number } }) => ({
      id: order.id,
      dailyOrderNumber: data.dailyOrderNumber,
      status: data.status,
      totalAmountByn: data.totalAmountByn,
      createdAt: order.createdAt,
    }));
    const tx = {
      $executeRaw: jest.fn(),
      tenant: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ timezone: 'UTC', dailyOrderNumber: 18, dailyOrderNumberDate: today, serviceMode: 'ORDERING' })
          .mockResolvedValueOnce({ dailyOrderNumber: 18, dailyOrderNumberDate: today }),
        update: jest.fn(),
      },
      menuItem: { findFirst: jest.fn().mockResolvedValue({
        id: 'menu-519', name: 'Блюдо', priceByn: 6.25, kitchenDepartment: 'HOT',
        menuItemModifierGroups: [], modifierGroups: [], stopListItem: null,
      }) },
      order: { create: orderCreate },
    };
    let savedPosOrderId: string | null = null;
    const tenantDb = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ posType: 'r_keeper', posApiKey: 'rk-key', posUrl: 'https://keeper.example/orders' }) },
      order: {
        findFirst: jest.fn().mockResolvedValue(order),
        update: jest.fn(({ data }: { data: { posOrderId: string } }) => {
          savedPosOrderId = data.posOrderId;
          return Promise.resolve({ ...order, posOrderId: savedPosOrderId });
        }),
      },
      menuItem: { findMany: jest.fn().mockResolvedValue([{ id: 'menu-519', posItemId: 'rk-item-519' }]) },
    };
    const prisma = {
      transactionForTenant: jest.fn((_tenantId: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
      forTenant: jest.fn().mockReturnValue(tenantDb),
    };
    (recovery.claimPosOrderSubmission as jest.Mock).mockResolvedValue(true);
    (posNetwork.requestPosOrder as jest.Mock).mockResolvedValue('rk-order-519');
    const config = { get: jest.fn((key: string, fallback: string) => key === 'POS_ALLOWED_HOSTS' ? 'keeper.example' : fallback) };
    const dispatcher = new PosOrderQueueService(prisma as never, config as never);
    const guestSession = new GuestSessionService(
      prisma as never,
      { emitKitchenOrder: jest.fn() } as never,
      dispatcher,
    );

    const result = await guestSession.createGuestOrder('tenant-519', 'table-519', {
      items: [{ menuItemId: 'menu-519', quantity: 2, selectedModifiers: [] }],
      comment: 'Без лука',
    });

    expect(result).toMatchObject({ orderId: order.id, dailyOrderNumber: 19, status: 'NEW', totalAmountByn: 12.5 });
    expect(mockQueueAdd).toHaveBeenCalledWith('submit-order', { tenantId: 'tenant-519', orderId: order.id }, expect.objectContaining({
      jobId: `pos-order-tenant-519-${order.id}`,
      attempts: 5,
    }));

    await dispatcher.processOrder('tenant-519', order.id);

    expect(savedPosOrderId).toBe('rk-order-519');
    expect(posNetwork.requestPosOrder).toHaveBeenCalledWith(
      new URL('https://keeper.example/orders'), 'rk-key', 'keeper.example', 15000,
      {
        externalId: order.id, number: 19, comment: 'Без лука', totalAmount: 12.5,
        items: [{ productId: 'rk-item-519', quantity: 2, price: 6.25 }],
      },
    );
  });
});
