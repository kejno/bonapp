import { BepaidWebhookService } from './bepaid-webhook';

describe('BNP-512 duplicate bePaid delivery', () => {
  it('completes a payment and closes its order only once across repeated processing', async () => {
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
    const job = { data: { tenantId: 'tenant-1', body: { transaction: { tracking_id: 'payment-1', uid: 'provider-1', status: 'successful' } } } };

    await processor.process(job);
    await processor.process(job);

    expect(updateOrder).toHaveBeenCalledTimes(1);
    expect(gateway.emitOrderStatusChanged).toHaveBeenCalledTimes(1);
    expect(gateway.closeOrderSession).toHaveBeenCalledTimes(1);
  });
});
