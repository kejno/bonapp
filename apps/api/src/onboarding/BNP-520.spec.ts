import { PosOrderQueueService } from './pos-order-queue.service';
import { OrdersService } from '../orders/orders.service';
import * as posNetwork from './pos-network';
import * as recovery from './pos-order-recovery';

jest.mock('./pos-network', () => ({ requestPosOrder: jest.fn() }));
jest.mock('./pos-order-recovery', () => ({
  claimPosOrderSubmission: jest.fn(),
  submitClaimedPosOrder: jest.fn((_prisma: unknown, _tenantId: string, _orderId: string, submit: () => Promise<string>) => submit()),
  isPosOrderEligible: jest.requireActual<typeof import('./pos-order-recovery')>('./pos-order-recovery').isPosOrderEligible,
  recoverPendingPosOrders: jest.fn(),
}));

describe('BNP-520: preserve a guest order when r_keeper is unavailable', () => {
  beforeEach(() => jest.clearAllMocks());

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

    const service = Object.create(PosOrderQueueService.prototype) as PosOrderQueueService;
    const logger = { error: jest.fn() };
    Object.defineProperty(service, 'logger', { value: logger });
    jest.spyOn(service as unknown as { addOrderJob: (tenantId: string, orderId: string) => Promise<void> }, 'addOrderJob')
      .mockRejectedValue(new Error('Redis unavailable'));

    await expect(service.enqueue('tenant-520', saved.id)).resolves.toBeUndefined();

    const createArgs: unknown = orderCreate.mock.calls[0]?.[0];
    expect(createArgs).toMatchObject({
      data: {
        totalAmountByn: 9,
        items: { create: [{ itemId: 'menu-520', quantity: 1, unitPriceByn: 9 }] },
      },
    });
    expect(saved).toEqual(persistedOrder);
    expect(logger.error).toHaveBeenCalledWith(
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
    (recovery.claimPosOrderSubmission as jest.Mock).mockResolvedValue(true);
    (posNetwork.requestPosOrder as jest.Mock).mockRejectedValue(new Error('r_keeper unavailable'));
    const service = Object.create(PosOrderQueueService.prototype) as PosOrderQueueService;
    Object.defineProperties(service, {
      prisma: { value: prisma },
      allowedPosHosts: { value: 'keeper.example' },
    });

    await expect((service as unknown as {
      process: (job: { data: { tenantId: string; orderId: string } }) => Promise<void>;
    }).process({ data: { tenantId: 'tenant-520', orderId: order.id } })).rejects.toThrow('r_keeper unavailable');

    expect(posNetwork.requestPosOrder).toHaveBeenCalled();
    expect(order.items).toEqual([{ itemId: 'menu-520', quantity: 1, unitPriceByn: 9 }]);
    expect(orderUpdate).not.toHaveBeenCalled();
  });
});
