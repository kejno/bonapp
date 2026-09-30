import { encryptCredentials } from '../tenant/payment-credentials';
import { PrismaService } from '../prisma/prisma.service';
import { EripWebhookService } from './erip-webhook';

let workerProcessor: ((job: { data: { tenantId: string; body: Record<string, unknown> } }) => Promise<void>) | undefined;

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(), close: jest.fn() })),
  Worker: jest.fn().mockImplementation((_name: string, processor: typeof workerProcessor) => {
    workerProcessor = processor;
    return { waitUntilReady: jest.fn(), close: jest.fn() };
  }),
}));

describe('EripWebhookService successful payment handling', () => {
  const secret = 'payment-test-secret';
  const paymentUpdateMany = jest.fn();
  const orderFindFirst = jest.fn();
  const prisma = {
    db: { tenant: { findUnique: jest.fn().mockResolvedValue({ paymentCredentials: {
      erip: encryptCredentials({ shopId: 'shop', secret: 'gateway-secret' }, secret),
    } }) } },
    transactionForTenant: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) => Promise.resolve(work({
      payment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'payment-1', orderId: 'order-1', providerTransactionId: 'uid-1', status: 'PENDING' }),
        updateMany: paymentUpdateMany,
      },
      order: { findFirst: orderFindFirst, update: jest.fn() },
      table: { update: jest.fn() },
    }))),
  } as unknown as PrismaService;
  const gateway = { emitPaymentStatusChanged: jest.fn(), emitOrderStatusChanged: jest.fn(), closeOrderSession: jest.fn() };
  const client = { get: jest.fn().mockResolvedValue({ uid: 'uid-1', status: 'successful' }) };
  const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;

  beforeEach(() => {
    process.env.PAYMENT_CREDENTIALS_SECRET = secret;
    jest.clearAllMocks();
    orderFindFirst.mockResolvedValue({ id: 'order-1', tableId: 'table-1', guestSessionId: null, isPaid: false, status: 'NEW' });
    paymentUpdateMany.mockResolvedValue({ count: 1 });
    new EripWebhookService(prisma, client as never, gateway as never);
  });

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
    else process.env.PAYMENT_CREDENTIALS_SECRET = previousSecret;
  });

  it('leaves the payment pending when its order is not ready to be paid', async () => {
    await workerProcessor?.({ data: { tenantId: 'tenant-1', body: { transaction: { tracking_id: 'payment-1', uid: 'uid-1', status: 'successful' } } } });

    expect(orderFindFirst).toHaveBeenCalled();
    expect(paymentUpdateMany).not.toHaveBeenCalled();
    expect(gateway.emitPaymentStatusChanged).not.toHaveBeenCalled();
  });
});
