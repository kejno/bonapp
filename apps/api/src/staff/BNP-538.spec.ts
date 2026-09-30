import { FiscalizationService } from './fiscalization.service';
import { PrismaService } from '../prisma/prisma.service';
import { encryptCredentials } from '../tenant/payment-credentials';

type JobData = { tenantId: string; paymentId: string };
type MockJob = { data: JobData; attemptsMade: number; opts: { attempts?: number } };
type QueueOptions = { attempts: number; backoff: { type: string; delay: number } };
type QueueAdd = (name: string, data: JobData, options: QueueOptions) => Promise<unknown>;
type MockWorkerOptions = { settings: { backoffStrategy: (attemptsMade: number, type: string) => number } };

let mockWorkerProcessor: ((job: { data: JobData }) => Promise<void>) | undefined;
let mockWorkerOptions: MockWorkerOptions | undefined;
let mockFailedHandler: ((job: MockJob | undefined, error: Error) => void) | undefined;
let mockQueueAdd: jest.MockedFunction<QueueAdd>;
let mockQueueCompletion: Promise<void> | undefined;

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    getJob: jest.fn(),
    add: (...args: [string, JobData, { attempts: number; backoff: { type: string; delay: number } }]) => mockQueueAdd(...args),
    close: jest.fn(),
  })),
  Worker: jest.fn().mockImplementation((_name: string, processor: typeof mockWorkerProcessor, options: typeof mockWorkerOptions) => {
    mockWorkerProcessor = processor;
    mockWorkerOptions = options;
    return { waitUntilReady: jest.fn(), close: jest.fn(), on: jest.fn((event: string, handler: typeof mockFailedHandler) => { if (event === 'failed') mockFailedHandler = handler; }) };
  }),
}));

describe('BNP-538: исчерпание попыток фискализации', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockQueueCompletion = undefined;
    mockQueueAdd = jest.fn((_name: string, data: JobData, options: QueueOptions) => {
      mockQueueCompletion = new Promise<void>((resolve) => {
        const runAttempt = async (attemptsMade: number): Promise<void> => {
          try {
            await mockWorkerProcessor?.({ data });
            resolve();
          } catch (error) {
            if (attemptsMade < options.attempts) {
              const delay = mockWorkerOptions?.settings.backoffStrategy(attemptsMade, options.backoff.type) ?? options.backoff.delay;
              setTimeout(() => { void runAttempt(attemptsMade + 1); }, delay);
              return;
            }
            mockFailedHandler?.({ data, attemptsMade, opts: { attempts: options.attempts } }, error as Error);
            resolve();
          }
        };
        void runAttempt(1);
      });
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('обрабатывает поставленную задачу с тремя ошибками, backoff 5/30 секунд и помечает платёж без номера чека', async () => {
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
    const service = new FiscalizationService(prisma, skno);
    const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;
    process.env.PAYMENT_CREDENTIALS_SECRET = 'test-secret';
    const logger = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

    try {
      await service.enqueue('tenant-1', 'payment-1');
      await jest.advanceTimersByTimeAsync(0);
      expect(skno.issueReceipt).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(4999);
      expect(skno.issueReceipt).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(skno.issueReceipt).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(29999);
      expect(skno.issueReceipt).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(1);
      await mockQueueCompletion;
      await Promise.resolve();

      expect(mockQueueAdd).toHaveBeenCalledWith('fiscalize-payment', { tenantId: 'tenant-1', paymentId: 'payment-1' }, expect.objectContaining({
        attempts: 3,
        backoff: { type: 'fiscalization', delay: 5000 },
      }));
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
