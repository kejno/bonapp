import { Test, TestingModule } from '@nestjs/testing';
import { FiscalService, FISCAL_QUEUE } from './fiscal.service';
import { FiscalizeJobData, FISCALIZE_QUEUE_NAME } from './fiscal-queue.types';
import { PrismaService } from '../prisma/prisma.service';

const mockQueue = { add: jest.fn() };
const mockPrisma = {
  payment: { update: jest.fn() },
};

describe('FiscalService', () => {
  let service: FiscalService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiscalService,
        { provide: FISCAL_QUEUE, useValue: mockQueue },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(FiscalService);
  });

  describe('enqueueFiscalization', () => {
    it('should add a job to the BullMQ queue', async () => {
      const data: FiscalizeJobData = {
        paymentId: 'pay-1',
        tenantId: 'tenant-1',
        orderId: 'order-1',
        amount: 150.00,
      };

      await service.enqueueFiscalization(data);

      expect(mockQueue.add).toHaveBeenCalledWith(FISCALIZE_QUEUE_NAME, data, {
        attempts: 3,
        backoff: { type: 'custom' },
        removeOnComplete: true,
        removeOnFail: false,
      });
    });

    it('should enqueue multiple payments independently', async () => {
      const payments: FiscalizeJobData[] = [
        { paymentId: 'pay-1', tenantId: 'tenant-1', orderId: 'order-1', amount: 10 },
        { paymentId: 'pay-2', tenantId: 'tenant-1', orderId: 'order-2', amount: 20 },
      ];

      for (const p of payments) {
        await service.enqueueFiscalization(p);
      }

      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    });
  });

  describe('markFiscalized', () => {
    it('should update payment with FISCALIZED status and receipt number', async () => {
      await service.markFiscalized('pay-1', 'RECEIPT-001');

      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: expect.objectContaining({
          fiscalStatus: 'FISCALIZED',
          fiscalReceiptNumber: 'RECEIPT-001',
          fiscalizedAt: expect.any(Date),
        }),
      });
    });
  });

  describe('markFiscalFailed', () => {
    it('should update payment with FISCAL_FAILED status', async () => {
      await service.markFiscalFailed('pay-1');

      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: expect.objectContaining({
          fiscalStatus: 'FISCAL_FAILED',
          fiscalFailedAt: expect.any(Date),
        }),
      });
    });
  });
});
