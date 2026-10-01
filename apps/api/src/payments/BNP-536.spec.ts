import { encryptCredentials } from '../tenant/payment-credentials';
import { EripWebhookService } from '../guest-session/erip-webhook';

let workerProcessor: ((job: { data: { tenantId: string; body: Record<string, unknown> } }) => Promise<void>) | undefined;

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(), close: jest.fn() })),
  Worker: jest.fn().mockImplementation((_name: string, processor: typeof workerProcessor) => {
    workerProcessor = processor;
    return { waitUntilReady: jest.fn(), close: jest.fn() };
  }),
}));

describe('BNP-536 duplicate successful ERIP webhook', () => {
  it('verifies each delivery and completes payment and order only once', async () => {
    const secret = 'test-credentials-secret';
    const updateMany = jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const orderUpdate = jest.fn();
    const tableUpdate = jest.fn();
    const tx = { payment: { findFirst: jest.fn().mockResolvedValue({ id: 'payment-1', orderId: 'order-1', providerTransactionId: 'provider-1', status: 'PENDING' }), updateMany }, order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1', tableId: 'table-1', guestSessionId: null, isPaid: false, status: 'SERVED' }), update: orderUpdate }, table: { update: tableUpdate } };
    const prisma = {
      db: { tenant: { findUnique: jest.fn().mockResolvedValue({ paymentCredentials: { erip: encryptCredentials({ shopId: 'shop-1', secret: 'provider-secret' }, secret) } }) } },
      transactionForTenant: jest.fn((_tenantId: string, work: (trx: typeof tx) => unknown) => Promise.resolve(work(tx))),
    };
    const gateway = { emitPaymentStatusChanged: jest.fn(), emitOrderStatusChanged: jest.fn(), closeOrderSession: jest.fn() };
    const erip = { get: jest.fn().mockResolvedValue({ uid: 'provider-1', status: 'successful' }) };
    const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;
    process.env.PAYMENT_CREDENTIALS_SECRET = secret;
    const service = new EripWebhookService(prisma as never, erip as never, gateway as never);
    try {
      const job = { data: { tenantId: 'tenant-1', body: { transaction: { tracking_id: 'payment-1', uid: 'provider-1', status: 'successful' } } } };
      await workerProcessor?.(job);
      await workerProcessor?.(job);
      expect(erip.get).toHaveBeenCalledTimes(2);
      expect(updateMany).toHaveBeenCalledTimes(2);
      expect(orderUpdate).toHaveBeenCalledTimes(1);
      expect(tableUpdate).toHaveBeenCalledTimes(1);
      expect(gateway.emitPaymentStatusChanged).toHaveBeenCalledTimes(1);
    } finally {
      await service.onModuleDestroy();
      if (previousSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
      else process.env.PAYMENT_CREDENTIALS_SECRET = previousSecret;
    }
  });
});
