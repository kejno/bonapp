import { encryptCredentials } from '../tenant/payment-credentials';
import { EripWebhookService } from './erip-webhook';

let workerProcessor: ((job: { data: { tenantId: string; body: Record<string, unknown> } }) => Promise<void>) | undefined;

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(), close: jest.fn() })),
  Worker: jest.fn().mockImplementation((_name: string, processor: typeof workerProcessor) => {
    workerProcessor = processor;
    return { waitUntilReady: jest.fn(), close: jest.fn() };
  }),
}));

describe('BNP-529 unsuccessful ERIP webhook', () => {
  it('keeps the order unpaid when bePaid confirms a failed payment', async () => {
    const encryptionSecret = 'test-credentials-secret';
    const paymentUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const orderUpdate = jest.fn();
    const tableUpdate = jest.fn();
    const payment = { id: 'payment-1', orderId: 'order-1', providerTransactionId: 'provider-1', status: 'PENDING' };
    const tx = {
      payment: { findFirst: jest.fn().mockResolvedValue(payment), updateMany: paymentUpdateMany },
      order: { findFirst: jest.fn(), update: orderUpdate },
      table: { update: tableUpdate },
    };
    const prisma = {
      db: { tenant: { findUnique: jest.fn().mockResolvedValue({ paymentCredentials: { erip: encryptCredentials({ shopId: 'shop-1', secret: 'provider-secret' }, encryptionSecret) } }) } },
      transactionForTenant: jest.fn((_tenantId: string, work: (transaction: typeof tx) => unknown) => Promise.resolve(work(tx))),
    };
    const gateway = { emitPaymentStatusChanged: jest.fn(), emitOrderStatusChanged: jest.fn(), closeOrderSession: jest.fn() };
    const erip = { get: jest.fn().mockResolvedValue({ uid: 'provider-1', status: 'failed' }) };
    const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;
    process.env.PAYMENT_CREDENTIALS_SECRET = encryptionSecret;
    const service = new EripWebhookService(prisma as never, erip as never, gateway as never);
    try {
      await workerProcessor?.({ data: { tenantId: 'tenant-1', body: { transaction: { tracking_id: 'payment-1', uid: 'provider-1', status: 'failed' } } } });

      expect(erip.get).toHaveBeenCalledWith('provider-1', 'shop-1', 'provider-secret');
      expect(paymentUpdateMany).toHaveBeenCalledWith({
        where: { id: 'payment-1', status: 'PENDING' },
        data: { status: 'PENDING', payload: { transaction: { tracking_id: 'payment-1', uid: 'provider-1', status: 'failed' } } },
      });
      expect(tx.order.findFirst).not.toHaveBeenCalled();
      expect(orderUpdate).not.toHaveBeenCalled();
      expect(tableUpdate).not.toHaveBeenCalled();
      expect(gateway.emitPaymentStatusChanged).not.toHaveBeenCalled();
      expect(gateway.emitOrderStatusChanged).not.toHaveBeenCalled();
      expect(gateway.closeOrderSession).not.toHaveBeenCalled();
    } finally {
      await service.onModuleDestroy();
      if (previousSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
      else process.env.PAYMENT_CREDENTIALS_SECRET = previousSecret;
    }
  });
});
