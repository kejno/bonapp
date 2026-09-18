import { Test, TestingModule } from '@nestjs/testing';
import { FiscalProcessor } from './fiscal.processor';
import { FiscalService } from './fiscal.service';
import { SKNO_API_SERVICE } from './skno/skno-api.interface';
import { PrismaService } from '../prisma/prisma.service';
import { Job } from 'bullmq';
import { FiscalizeJobData } from './fiscal-queue.types';

const mockSknoApi = { fiscalizePayment: jest.fn() };
const mockPrisma = {
  tenantSettings: { findUnique: jest.fn() },
};
const mockFiscalService = {
  markFiscalized: jest.fn(),
  markFiscalFailed: jest.fn(),
};

function makeJob(data: FiscalizeJobData, attemptsMade = 0, attempts = 3): Job<FiscalizeJobData> {
  return { data, attemptsMade, opts: { attempts } } as unknown as Job<FiscalizeJobData>;
}

describe('FiscalProcessor', () => {
  let processor: FiscalProcessor;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiscalProcessor,
        { provide: SKNO_API_SERVICE, useValue: mockSknoApi },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FiscalService, useValue: mockFiscalService },
      ],
    }).compile();

    processor = module.get(FiscalProcessor);
  });

  describe('process', () => {
    const jobData: FiscalizeJobData = {
      paymentId: 'pay-1',
      tenantId: 'tenant-1',
      orderId: 'order-1',
      amount: 200.00,
    };
    const tenantSettings = {
      tenantId: 'tenant-1',
      sknoSerial: 'SN-001',
      sknoUnp: '123456789',
      sknoApiUrl: 'http://skno.local',
    };

    it('should call SKNO API and mark payment as fiscalized on success', async () => {
      mockPrisma.tenantSettings.findUnique.mockResolvedValue(tenantSettings);
      mockSknoApi.fiscalizePayment.mockResolvedValue('RECEIPT-42');

      await processor.process(makeJob(jobData));

      expect(mockSknoApi.fiscalizePayment).toHaveBeenCalledWith({
        paymentId: 'pay-1',
        tenantId: 'tenant-1',
        orderId: 'order-1',
        amount: 200.00,
        sknoSerial: 'SN-001',
        sknoUnp: '123456789',
      });
      expect(mockFiscalService.markFiscalized).toHaveBeenCalledWith('pay-1', 'RECEIPT-42');
    });

    it('should throw when TenantSettings not found (triggers BullMQ retry)', async () => {
      mockPrisma.tenantSettings.findUnique.mockResolvedValue(null);

      await expect(processor.process(makeJob(jobData))).rejects.toThrow(
        'TenantSettings not found for tenant tenant-1',
      );
    });

    it('should throw when SKNO API fails (triggers BullMQ retry)', async () => {
      mockPrisma.tenantSettings.findUnique.mockResolvedValue(tenantSettings);
      mockSknoApi.fiscalizePayment.mockRejectedValue(new Error('SKNO timeout'));

      await expect(processor.process(makeJob(jobData))).rejects.toThrow('SKNO timeout');
      expect(mockFiscalService.markFiscalized).not.toHaveBeenCalled();
    });

    it('should process multiple payments independently', async () => {
      mockPrisma.tenantSettings.findUnique.mockResolvedValue(tenantSettings);
      mockSknoApi.fiscalizePayment
        .mockResolvedValueOnce('RECEIPT-1')
        .mockResolvedValueOnce('RECEIPT-2');

      const jobs = [
        makeJob({ ...jobData, paymentId: 'pay-1' }),
        makeJob({ ...jobData, paymentId: 'pay-2' }),
      ];

      for (const job of jobs) {
        await processor.process(job);
      }

      expect(mockFiscalService.markFiscalized).toHaveBeenCalledWith('pay-1', 'RECEIPT-1');
      expect(mockFiscalService.markFiscalized).toHaveBeenCalledWith('pay-2', 'RECEIPT-2');
    });
  });

  describe('onJobFailed', () => {
    it('should mark payment as fiscal_failed when all attempts exhausted', async () => {
      const job = makeJob({ paymentId: 'pay-1', tenantId: 't1', orderId: 'o1', amount: 10 }, 3, 3);
      await processor.onJobFailed(job, new Error('Network error'));
      expect(mockFiscalService.markFiscalFailed).toHaveBeenCalledWith('pay-1');
    });

    it('should not mark fiscal_failed on intermediate failure', async () => {
      const job = makeJob({ paymentId: 'pay-1', tenantId: 't1', orderId: 'o1', amount: 10 }, 1, 3);
      await processor.onJobFailed(job, new Error('Network error'));
      expect(mockFiscalService.markFiscalFailed).not.toHaveBeenCalled();
    });

    it('should handle undefined job gracefully', async () => {
      await expect(processor.onJobFailed(undefined, new Error('crash'))).resolves.not.toThrow();
    });
  });
});
