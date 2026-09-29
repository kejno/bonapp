import { Logger } from '@nestjs/common';
import { PosOrderQueueService } from './pos-order-queue.service';
import { OrdersService } from '../orders/orders.service';
import * as posNetwork from './pos-network';
import * as recovery from './pos-order-recovery';

const mockWorkerListeners: Record<string, (...args: unknown[]) => void> = {};
let mockWorkerProcessor: ((job: { data: { tenantId: string; orderId: string } }) => Promise<void>) | undefined;
let mockQueueAdd: jest.Mock;

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: mockQueueAdd, close: jest.fn() })),
  Worker: jest.fn().mockImplementation((_name: string, processor: typeof mockWorkerProcessor) => {
    mockWorkerProcessor = processor;
    return {
      on: jest.fn((event: string, listener: (...args: unknown[]) => void) => { mockWorkerListeners[event] = listener; }),
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
      await mockWorkerProcessor?.({ data });
    });
    Object.keys(mockWorkerListeners).forEach((event) => delete mockWorkerListeners[event]);
  });

  it('keeps the saved order and its items when POS queue submission fails', async () => {
    const persistedOrder = {
      id: 'order-520', tenantId: 'tenant-520', totalAmountByn: 9,
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
    const tenantContext = { getTenantId: jest.fn().mockReturnValue('tenant-520') };
    const orders = new OrdersService(prisma as never, tenantContext as never);
    const saved = await orders.create('table-520', undefined, [{ menuItemId: 'menu-520', quantity: 1, selectedModifiers: [] }]);

    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const service = new PosOrderQueueService({} as never, { get: jest.fn().mockReturnValue('') } as never);
    mockQueueAdd.mockRejectedValue(new Error('Redis unavailable'));

    await expect(service.enqueue('tenant-520', saved.id)).resolves.toBeUndefined();

    const createArgs: unknown = orderCreate.mock.calls[0]?.[0];
    expect(createArgs).toMatchObject({
      data: {
        totalAmountByn: 9,
        items: { create: [{ itemId: 'menu-520', quantity: 1, unitPriceByn: 9 }] },
      },
    });
    expect(saved).toEqual(persistedOrder);
    expect(logger).toHaveBeenCalledWith(
      'Не удалось поставить заказ order-520 в очередь POS', expect.any(String),
    );
  });

  it('retains the created order and items when the queued POS request fails', async () => {
    const order = {
      id: 'order-520-worker', dailyOrderNumber: 20, comment: null, totalAmountByn: 9,
      posOrderId: null, posOrderSubmittedAt: null, status: 'NEW', isPaid: false,
      items: [{ itemId: 'menu-520', quantity: 1, unitPriceByn: 9 }],
    };
    const orderUpdate = jest.fn();
    const menuItem = { id: 'menu-520', posItemId: 'rk-item-520' };
    const prisma = {
      forTenant: () => ({
        tenant: { findUnique: jest.fn().mockResolvedValue({
          posType: 'r_keeper', posApiKey: 'rk-key', posUrl: 'https://keeper.example/orders',
        }) },
        order: { findFirst: jest.fn().mockResolvedValue(order), update: orderUpdate },
        menuItem: { findMany: jest.fn().mockResolvedValue([menuItem]) },
      }),
    };
    (posNetwork.requestPosOrder as jest.Mock).mockRejectedValue(new Error('r_keeper unavailable'));
    (recovery.claimPosOrderSubmission as jest.Mock).mockResolvedValue(true);
    const service = new PosOrderQueueService(prisma as never, {
      get: jest.fn((key: string, fallback: string) => key === 'POS_ALLOWED_HOSTS' ? 'keeper.example' : fallback),
    } as never);
    await service.enqueue('tenant-520', order.id);

    expect(posNetwork.requestPosOrder).toHaveBeenCalled();
    expect(order.items).toEqual([{ itemId: 'menu-520', quantity: 1, unitPriceByn: 9 }]);
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('logs a worker failure after r_keeper rejects the order', () => {
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    new PosOrderQueueService({} as never, { get: jest.fn().mockReturnValue('') } as never);

    mockWorkerListeners.failed(
      { data: { orderId: 'order-520-worker' } },
      new Error('r_keeper unavailable'),
    );

    expect(logger).toHaveBeenCalledWith(
      'Не удалось отправить заказ order-520-worker в POS', expect.any(String),
    );
  });
});
