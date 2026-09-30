import { Queue } from 'bullmq';
import { FiscalizationService } from './fiscalization.service';
import { PrismaService } from '../prisma/prisma.service';
import { encryptCredentials } from '../tenant/payment-credentials';
import { Logger } from '@nestjs/common';

let mockWorkerProcessor: ((job: { data: { tenantId: string; paymentId: string } }) => Promise<void>) | undefined;
let mockWorkerOptions: unknown;
type MockJob = { data: { tenantId: string; paymentId: string }; attemptsMade: number; opts: { attempts?: number } };
let mockFailedHandler: ((job: MockJob | undefined, error: Error) => void) | undefined;
let mockQueueJob: { getState: jest.Mock<Promise<string>>; remove: jest.Mock<Promise<void>> } | undefined;
let mockQueueAdd: jest.Mock;

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ getJob: jest.fn().mockImplementation(() => Promise.resolve(mockQueueJob)), add: mockQueueAdd, close: jest.fn() })),
  Worker: jest.fn().mockImplementation((_name: string, processor: typeof mockWorkerProcessor, options: unknown) => {
    mockWorkerProcessor = processor;
    mockWorkerOptions = options;
    return { waitUntilReady: jest.fn(), close: jest.fn(), on: jest.fn((event: string, handler: typeof mockFailedHandler) => { if (event === 'failed') mockFailedHandler = handler; }) };
  }),
}));

describe('FiscalizationService', () => {
  beforeEach(() => {
    mockQueueJob = undefined;
    mockQueueAdd = jest.fn().mockResolvedValue({});
  });

  it('queues fiscalization with three attempts and 5/30 second retry delays', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = { transactionForTenant: jest.fn((_tenantId: string, operation: (tx: unknown) => unknown) => Promise.resolve(operation({ payment: { updateMany } })) ) } as unknown as PrismaService;
    const service = new FiscalizationService(prisma, { issueReceipt: jest.fn() });
    await service.enqueue('tenant-1', 'payment-1');

    const queue = jest.mocked(Queue).mock.results.at(-1)!.value as unknown as {
      add: jest.MockedFunction<(name: string, data: unknown, options: { attempts: number; backoff: { type: string; delay: number } }) => Promise<unknown>>;
    };
    expect(queue.add).toHaveBeenCalledWith(
      'fiscalize-payment',
      { tenantId: 'tenant-1', paymentId: 'payment-1' },
      expect.any(Object),
    );
    const jobOptions = queue.add.mock.calls[0][2];
    expect(jobOptions).toEqual(expect.objectContaining({ attempts: 3, backoff: { type: 'fiscalization', delay: 5000 } }));
    const options = mockWorkerOptions as { settings: { backoffStrategy: (attemptsMade: number, type: string) => number } };
    expect([options.settings.backoffStrategy(1, 'fiscalization'), options.settings.backoffStrategy(2, 'fiscalization')]).toEqual([5000, 30000]);
  });

  it('removes a previously failed BullMQ job before re-enqueueing its payment', async () => {
    const failedJob = { getState: jest.fn().mockResolvedValue('failed'), remove: jest.fn().mockResolvedValue(undefined) };
    mockQueueJob = failedJob;
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = { transactionForTenant: jest.fn((_tenantId: string, operation: (tx: unknown) => unknown) => Promise.resolve(operation({ payment: { updateMany } }))) } as unknown as PrismaService;
    const service = new FiscalizationService(prisma, { issueReceipt: jest.fn() });

    await service.enqueue('tenant-1', 'payment-1');

    expect(failedJob.remove).toHaveBeenCalledTimes(1);
    expect(mockQueueAdd).toHaveBeenCalledWith('fiscalize-payment', { tenantId: 'tenant-1', paymentId: 'payment-1' }, expect.objectContaining({ jobId: 'fiscalize-tenant-1-payment-1' }));
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { fiscalizationStatus: 'PENDING' } }));
  });

  it('stores the receipt number after a successful payment is fiscalized', async () => {
    const update = jest.fn().mockResolvedValue({});
    const payment = { id: 'payment-1', amountByn: '18.00', fiscalReceiptNumber: null, order: { items: [
      { itemId: 'tea', quantity: 2, unitPriceByn: '7.50' },
      { itemId: 'coffee', quantity: 1, unitPriceByn: '3.00' },
    ] } };
    const prisma = {
      forTenant: jest.fn().mockReturnValue({ payment: { findFirst: jest.fn().mockResolvedValue(payment), update } }),
      db: {
        tenant: { findUnique: jest.fn().mockResolvedValue({ paymentCredentials: { skno: encryptCredentials({ cashRegisterSerial: 'serial', host: 'http://cash.local', username: 'service', password: 'secret', unp: '123456789' }, 'test-secret') } }) },
        menuItem: { findMany: jest.fn().mockResolvedValue([{ id: 'tea', name: 'Tea' }, { id: 'coffee', name: 'Coffee' }]) },
      },
    } as unknown as PrismaService;
    const skno = { issueReceipt: jest.fn().mockResolvedValue('42') };
    new FiscalizationService(prisma, skno);
    const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;
    process.env.PAYMENT_CREDENTIALS_SECRET = 'test-secret';
    try {
      await mockWorkerProcessor?.({ data: { tenantId: 'tenant-1', paymentId: 'payment-1' } });
      expect(skno.issueReceipt).toHaveBeenCalledWith(expect.objectContaining({ cashRegisterSerial: 'serial' }), {
        paymentId: 'payment-1', amount: 18, items: [{ name: 'Tea', quantity: 2, price: 7.5 }, { name: 'Coffee', quantity: 1, price: 3 }],
      });
      expect(update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'payment-1' },
        data: { fiscalReceiptNumber: '42', fiscalizationStatus: 'FISCALIZED' },
      }));
    } finally {
      if (previousSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
      else process.env.PAYMENT_CREDENTIALS_SECRET = previousSecret;
    }
  });

  it('marks a payment failed and logs an alert after the third attempt', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = { forTenant: jest.fn().mockReturnValue({ payment: { updateMany } }) } as unknown as PrismaService;
    new FiscalizationService(prisma, { issueReceipt: jest.fn() });
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    mockFailedHandler?.({ data: { tenantId: 'tenant-1', paymentId: 'payment-1' }, attemptsMade: 3, opts: { attempts: 3 } }, new Error('SKNO unavailable'));
    await new Promise((resolve) => setImmediate(resolve));
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'payment-1', fiscalReceiptNumber: null },
      data: { fiscalizationStatus: 'FISCAL_FAILED' },
    }));
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('исчерпала три попытки'), expect.any(String));
    logger.mockRestore();
  });
});
