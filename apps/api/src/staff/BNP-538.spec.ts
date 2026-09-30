import { FiscalizationService } from './fiscalization.service';
import { PrismaService } from '../prisma/prisma.service';
import { encryptCredentials } from '../tenant/payment-credentials';

let mockWorkerProcessor: ((job: { data: { tenantId: string; paymentId: string } }) => Promise<void>) | undefined;
let mockWorkerOptions: { settings: { backoffStrategy: (attemptsMade: number, type: string) => number } } | undefined;
let mockFailedHandler: ((job: MockJob | undefined, error: Error) => void) | undefined;
let mockQueueAdd: jest.Mock;
type MockJob = { data: { tenantId: string; paymentId: string }; attemptsMade: number; opts: { attempts?: number } };

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ getJob: jest.fn(), add: mockQueueAdd, close: jest.fn() })),
  Worker: jest.fn().mockImplementation((_name: string, processor: typeof mockWorkerProcessor, options: typeof mockWorkerOptions) => {
    mockWorkerProcessor = processor;
    mockWorkerOptions = options;
    return { waitUntilReady: jest.fn(), close: jest.fn(), on: jest.fn((event: string, handler: typeof mockFailedHandler) => { if (event === 'failed') mockFailedHandler = handler; }) };
  }),
}));

describe('BNP-538: исчерпание попыток фискализации', () => {
  it('повторно вызывает СКНО три раза с настройками backoff и сохраняет fiscal_failed без номера чека', async () => {
    const paymentUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const payment = {
      id: 'payment-1',
      amountByn: '18.00',
      fiscalReceiptNumber: null,
      order: { items: [{ itemId: 'tea', quantity: 1, unitPriceByn: '18.00' }] },
    };
    const prisma = {
      transactionForTenant: jest.fn((_tenantId: string, operation: (tx: unknown) => unknown) => Promise.resolve(operation({ payment: { updateMany: paymentUpdate } }))),
      forTenant: jest.fn().mockReturnValue({
        payment: { findFirst: jest.fn().mockResolvedValue(payment), update: jest.fn(), updateMany: paymentUpdate },
      }),
      db: {
        tenant: { findUnique: jest.fn().mockResolvedValue({ paymentCredentials: { skno: encryptCredentials({ cashRegisterSerial: 'serial', host: 'http://cash.local', username: 'service', password: 'secret', unp: '123456789' }, 'test-secret') } }) },
        menuItem: { findMany: jest.fn().mockResolvedValue([{ id: 'tea', name: 'Tea' }]) },
      },
    } as unknown as PrismaService;
    const skno = { issueReceipt: jest.fn().mockRejectedValue(new Error('SKNO unavailable')) };
    mockQueueAdd = jest.fn().mockResolvedValue({});
    const service = new FiscalizationService(prisma, skno);
    const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;
    process.env.PAYMENT_CREDENTIALS_SECRET = 'test-secret';
    const logger = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

    try {
      await service.enqueue('tenant-1', 'payment-1');
      expect(mockQueueAdd).toHaveBeenCalledWith('fiscalize-payment', { tenantId: 'tenant-1', paymentId: 'payment-1' }, expect.objectContaining({ attempts: 3, backoff: { type: 'fiscalization', delay: 5000 } }));
      expect(mockWorkerOptions?.settings.backoffStrategy(1, 'fiscalization')).toBe(5000);
      expect(mockWorkerOptions?.settings.backoffStrategy(2, 'fiscalization')).toBe(30000);

      const jobData = { tenantId: 'tenant-1', paymentId: 'payment-1' };
      for (let attempt = 1; attempt <= 3; attempt++) {
        await expect(mockWorkerProcessor?.({ data: jobData })).rejects.toThrow('SKNO unavailable');
        if (attempt === 3) mockFailedHandler?.({ data: jobData, attemptsMade: attempt, opts: { attempts: 3 } }, new Error('SKNO unavailable'));
      }
      await new Promise((resolve) => setImmediate(resolve));

      expect(skno.issueReceipt).toHaveBeenCalledTimes(3);
      expect(paymentUpdate).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'payment-1', fiscalReceiptNumber: null },
        data: { fiscalizationStatus: 'FISCAL_FAILED' },
      }));
      expect(payment.fiscalReceiptNumber).toBeNull();
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('исчерпала три попытки'), expect.any(String));
    } finally {
      logger.mockRestore();
      if (previousSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
      else process.env.PAYMENT_CREDENTIALS_SECRET = previousSecret;
    }
  });
});
