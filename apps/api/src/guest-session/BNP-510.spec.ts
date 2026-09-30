import { BepaidWebhookService } from './bepaid-webhook';

describe('BNP-510 successful bePaid webhook', () => {
  it('marks the matching payment and order paid only when processed as successful', async () => {
    const payment = { id: 'payment-1', orderId: 'order-1', status: 'PENDING', providerTransactionId: null };
    const updatePayment = jest.fn(({ data }: { data: Record<string, unknown> }) => {
      Object.assign(payment, data);
      return payment;
    });
    const updateOrder = jest.fn();
    const tx = {
      payment: { findFirst: jest.fn().mockResolvedValue(payment), update: updatePayment },
      order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1', tableId: 'table-1', isPaid: false, status: 'SERVED' }), update: updateOrder },
      table: { update: jest.fn() },
    };
    const prisma = { transactionForTenant: jest.fn((_tenantId: string, work: (value: typeof tx) => unknown) => Promise.resolve(work(tx))) };
    const gateway = { emitOrderStatusChanged: jest.fn(), closeOrderSession: jest.fn() };
    const service = Object.create(BepaidWebhookService.prototype) as BepaidWebhookService;
    Object.assign(service, { prisma, menuGateway: gateway });
    const processor = service as unknown as { process: (job: { data: { tenantId: string; body: object } }) => Promise<void> };

    await processor.process({ data: { tenantId: 'tenant-1', body: { transaction: { tracking_id: 'payment-1', uid: 'provider-1', status: 'successful' } } } });

    expect(payment).toMatchObject({ status: 'SUCCEEDED', providerTransactionId: 'provider-1' });
    expect(updateOrder).toHaveBeenCalledTimes(1);
    expect(gateway.emitOrderStatusChanged).toHaveBeenCalledWith('tenant-1', 'order-1', 'PAID');
  });
});
