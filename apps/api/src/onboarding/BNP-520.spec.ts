import { GuestSessionService } from '../guest-session/guest-session.service';
import { PosOrderQueueService } from './pos-order-queue.service';
import * as posNetwork from './pos-network';
import * as recovery from './pos-order-recovery';

let mockWorkerProcessor: ((job: { data: { tenantId: string; orderId: string } }) => Promise<void>) | undefined;
let mockQueueAdd: jest.Mock;

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: mockQueueAdd, close: jest.fn() })),
  Worker: jest.fn().mockImplementation((_name: string, processor: typeof mockWorkerProcessor) => {
    mockWorkerProcessor = processor;
    return {
      on: jest.fn(),
      close: jest.fn(),
      waitUntilReady: jest.fn(),
    };
  }),
}));

jest.mock('./pos-network', () => ({ requestPosOrder: jest.fn() }));
jest.mock('./pos-order-recovery', () => ({
  claimPosOrderSubmission: jest.fn(),
  submitClaimedPosOrder: jest.fn((_prisma: unknown, _tenantId: string, _orderId: string, submit: () => Promise<string>) => submit()),
  isPosOrderEligible: jest.requireActual<typeof import('./pos-order-recovery')>('./pos-order-recovery').isPosOrderEligible,
  recoverPendingPosOrders: jest.fn(),
}));

describe('BNP-520: preserve a guest order when r_keeper is unavailable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkerProcessor = undefined;
    mockQueueAdd = jest.fn(async (_name: string, data: { tenantId: string; orderId: string }) => {
      try {
        await mockWorkerProcessor?.({ data });
      } catch {
        // The job runs after enqueue; a worker failure does not reject order creation.
      }
    });
  });

  it('keeps the saved order and its items when POS queue submission fails', async () => {
    const persistedOrder = {
      id: 'order-520', tenantId: 'tenant-520', totalAmountByn: 9,
      dailyOrderNumber: 1, status: 'NEW', createdAt: new Date('2026-09-29T12:00:00.000Z'),
      items: [{ itemId: 'menu-520', quantity: 1, unitPriceByn: 9 }],
    };
    const orderCreate = jest.fn<Promise<typeof persistedOrder>, [unknown]>().mockResolvedValue(persistedOrder);
    const transaction = jest.fn(async (_tenantId: string, operation: (tx: unknown) => Promise<unknown>) => operation({
      $executeRaw: jest.fn(),
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ serviceMode: 'ORDERING', dailyOrderNumber: 0, dailyOrderNumberDate: null, timezone: 'UTC' }),
        update: jest.fn(),
      },
      table: { findFirst: jest.fn().mockResolvedValue({ id: 'table-520' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      menuItem: { findFirst: jest.fn().mockResolvedValue({
        id: 'menu-520', name: 'Блюдо', priceByn: 9, kitchenDepartment: 'HOT',
        menuItemModifierGroups: [], modifierGroups: [], stopListItem: null,
      }) },
      order: { create: orderCreate },
    }));
    const prisma = { transactionForTenant: transaction };
    const service = new PosOrderQueueService({} as never, { get: jest.fn().mockReturnValue('') } as never);
    mockQueueAdd.mockRejectedValue(new Error('Redis unavailable'));
    const guestSession = new GuestSessionService(
      prisma as never,
      { emitKitchenOrder: jest.fn() } as never,
      service,
    );
    const created = await guestSession.createGuestOrder('tenant-520', 'table-520', {
      items: [{ menuItemId: 'menu-520', quantity: 1, selectedModifiers: [] }],
      comment: '',
    });

    expect(created).toMatchObject({ orderId: persistedOrder.id, totalAmountByn: 9, status: 'NEW' });
  });

  it('retains the created order and items when the queued POS request fails', async () => {
    const order = {
      id: 'order-520-worker', dailyOrderNumber: 20, comment: null, totalAmountByn: 9,
      posOrderId: null, posOrderSubmittedAt: null, status: 'NEW', isPaid: false,
      createdAt: new Date('2026-09-29T12:00:00.000Z'),
    };
    const tx = {
      $executeRaw: jest.fn(),
      tenant: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ timezone: 'UTC', dailyOrderNumber: 19, dailyOrderNumberDate: '2026-09-29', serviceMode: 'ORDERING' })
          .mockResolvedValueOnce({ dailyOrderNumber: 19, dailyOrderNumberDate: '2026-09-29' }),
        update: jest.fn(),
      },
      menuItem: { findFirst: jest.fn().mockResolvedValue({
        id: 'menu-520', name: 'Блюдо', priceByn: 9, kitchenDepartment: 'HOT',
        menuItemModifierGroups: [], modifierGroups: [], stopListItem: null,
      }) },
      order: { create: jest.fn().mockResolvedValue(order) },
    };
    const prisma = {
      transactionForTenant: jest.fn((_tenantId: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
      forTenant: () => ({
        tenant: { findUnique: jest.fn().mockResolvedValue({
          posType: 'r_keeper', posApiKey: 'rk-key', posUrl: 'https://keeper.example/orders',
        }) },
        order: { findFirst: jest.fn().mockResolvedValue({ ...order, items: [{ itemId: 'menu-520', quantity: 1, unitPriceByn: 9 }] }), update: jest.fn() },
        menuItem: { findMany: jest.fn().mockResolvedValue([{ id: 'menu-520', posItemId: 'rk-item-520' }]) },
      }),
    };
    (posNetwork.requestPosOrder as jest.Mock).mockRejectedValue(new Error('r_keeper unavailable'));
    (recovery.claimPosOrderSubmission as jest.Mock).mockResolvedValue(true);
    const service = new PosOrderQueueService(prisma as never, {
      get: jest.fn((key: string, fallback: string) => key === 'POS_ALLOWED_HOSTS' ? 'keeper.example' : fallback),
    } as never);
    const guestSession = new GuestSessionService(prisma as never, { emitKitchenOrder: jest.fn() } as never, service);
    const created = await guestSession.createGuestOrder('tenant-520', 'table-520', {
      items: [{ menuItemId: 'menu-520', quantity: 1, selectedModifiers: [] }],
      comment: '',
    });

    expect(created).toMatchObject({ orderId: order.id, totalAmountByn: 9, status: 'NEW' });
    expect(posNetwork.requestPosOrder).toHaveBeenCalled();
  });
});
