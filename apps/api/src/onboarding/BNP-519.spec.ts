import { PosOrderQueueService } from './pos-order-queue.service';
import * as posNetwork from './pos-network';
import * as recovery from './pos-order-recovery';

jest.mock('./pos-network', () => ({ requestPosOrder: jest.fn() }));
jest.mock('./pos-order-recovery', () => ({
  claimPosOrderSubmission: jest.fn(),
  submitClaimedPosOrder: jest.fn((_prisma: unknown, _tenantId: string, _orderId: string, submit: () => Promise<string>) => submit()),
  isPosOrderEligible: jest.requireActual<typeof import('./pos-order-recovery')>('./pos-order-recovery').isPosOrderEligible,
  recoverPendingPosOrders: jest.fn(),
}));

describe('BNP-519: submit a guest order to r_keeper', () => {
  it('sends a queued order to the POS and persists the returned POS order ID', async () => {
    const orderUpdate = jest.fn();
    const order = {
      id: 'order-519', dailyOrderNumber: 19, comment: 'Без лука', totalAmountByn: 12.5,
      posOrderId: null, posOrderSubmittedAt: null, status: 'NEW', isPaid: false,
      items: [{ itemId: 'menu-519', quantity: 2, unitPriceByn: 6.25 }],
    };
    const prisma = {
      forTenant: () => ({
        tenant: { findUnique: jest.fn().mockResolvedValue({ posType: 'r_keeper', posApiKey: 'rk-key', posUrl: 'https://keeper.example/orders' }) },
        order: { findFirst: jest.fn().mockResolvedValue(order), update: orderUpdate },
        menuItem: { findMany: jest.fn().mockResolvedValue([{ id: 'menu-519', posItemId: 'rk-item-519' }]) },
      }),
    };
    (recovery.claimPosOrderSubmission as jest.Mock).mockResolvedValue(true);
    (posNetwork.requestPosOrder as jest.Mock).mockResolvedValue('rk-order-519');
    const service = Object.create(PosOrderQueueService.prototype) as PosOrderQueueService;
    Object.defineProperties(service, {
      prisma: { value: prisma },
      allowedPosHosts: { value: 'keeper.example' },
    });

    await (service as unknown as { process: (job: { data: { tenantId: string; orderId: string } }) => Promise<void> })
      .process({ data: { tenantId: 'tenant-519', orderId: order.id } });

    expect(posNetwork.requestPosOrder).toHaveBeenCalledWith(
      new URL('https://keeper.example/orders'), 'rk-key', 'keeper.example', 15000,
      {
        externalId: 'order-519', number: 19, comment: 'Без лука', totalAmount: 12.5,
        items: [{ productId: 'rk-item-519', quantity: 2, price: 6.25 }],
      },
    );
    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id_tenantId: { id: 'order-519', tenantId: 'tenant-519' } },
      data: { posOrderId: 'rk-order-519' },
    });
  });
});
