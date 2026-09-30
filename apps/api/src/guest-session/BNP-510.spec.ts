import { generateKeyPairSync, sign } from 'node:crypto';
import { encryptCredentials } from '../tenant/payment-credentials';
import { BepaidWebhookService } from './bepaid-webhook';

type WebhookJob = { data: { tenantId: string; body: Record<string, unknown> } };
let registeredProcessor: ((job: WebhookJob) => Promise<void>) | undefined;
let queueCalls: unknown[][];

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: (...args: unknown[]) => { queueCalls.push(args); return Promise.resolve(); },
    close: jest.fn(),
  })),
  Worker: jest.fn().mockImplementation((_name: string, processor: typeof registeredProcessor) => {
    registeredProcessor = processor;
    return { waitUntilReady: jest.fn(), close: jest.fn() };
  }),
}));

describe('BNP-510 successful bePaid webhook', () => {
  const oldSecret = process.env.PAYMENT_CREDENTIALS_SECRET;

  afterAll(() => {
    if (oldSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
    else process.env.PAYMENT_CREDENTIALS_SECRET = oldSecret;
  });

  beforeEach(() => {
    registeredProcessor = undefined;
    queueCalls = [];
  });

  it('queues the verified callback and completes payment through the registered BullMQ processor', async () => {
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const credentialsSecret = 'credentials-secret';
    process.env.PAYMENT_CREDENTIALS_SECRET = credentialsSecret;
    const encrypted = encryptCredentials({
      provider: 'bepaid',
      shopId: 'shop',
      secret: 'gateway-secret',
      publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }),
    }, credentialsSecret);

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
    const prisma = {
      db: { tenant: { findUnique: jest.fn().mockResolvedValue({ paymentCredentials: { bepaid: encrypted } }) } },
      transactionForTenant: jest.fn((_tenantId: string, work: (value: typeof tx) => unknown) => Promise.resolve(work(tx))),
    };
    const gateway = { emitOrderStatusChanged: jest.fn(), closeOrderSession: jest.fn() };
    const service = new BepaidWebhookService(prisma as never, gateway as never);
    const body = { transaction: { tracking_id: 'payment-1', uid: 'provider-1', status: 'successful' } };
    const raw = Buffer.from(JSON.stringify(body));
    const signature = sign('RSA-SHA256', raw, keys.privateKey).toString('base64');

    await service.accept('tenant-1', raw, signature, `Basic ${Buffer.from('shop:gateway-secret').toString('base64')}`);

    expect(queueCalls).toHaveLength(1);
    expect(queueCalls[0]).toEqual(['process', { tenantId: 'tenant-1', body }, expect.objectContaining({ jobId: 'bepaid-tenant-1-payment-1-provider-1' })]);
    expect(registeredProcessor).toBeDefined();
    await registeredProcessor!({ data: queueCalls[0][1] as WebhookJob['data'] });

    expect(payment).toMatchObject({ status: 'SUCCEEDED', providerTransactionId: 'provider-1' });
    expect(updateOrder).toHaveBeenCalledTimes(1);
    expect(gateway.emitOrderStatusChanged).toHaveBeenCalledWith('tenant-1', 'order-1', 'PAID');
    expect(gateway.closeOrderSession).toHaveBeenCalledWith('tenant-1', 'table-1', 'order-1');
    await service.onModuleDestroy();
  });
});
