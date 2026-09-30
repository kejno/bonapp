import { Logger } from '@nestjs/common';
import { FiscalizationService } from './fiscalization.service';
import { PrismaService } from '../prisma/prisma.service';

type MockJob = { data: { tenantId: string; paymentId: string }; attemptsMade: number; opts: { attempts?: number } };
let mockFailedHandler: ((job: MockJob | undefined, error: Error) => void) | undefined;

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ getJob: jest.fn(), add: jest.fn(), close: jest.fn() })),
  Worker: jest.fn().mockImplementation(() => ({
    waitUntilReady: jest.fn(),
    close: jest.fn(),
    on: jest.fn((event: string, handler: typeof mockFailedHandler) => { if (event === 'failed') mockFailedHandler = handler; }),
  })),
}));

describe('BNP-538: исчерпание попыток фискализации', () => {
  it('после трёх неудачных попыток помечает платёж fiscal_failed и записывает alert в лог', async () => {
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
