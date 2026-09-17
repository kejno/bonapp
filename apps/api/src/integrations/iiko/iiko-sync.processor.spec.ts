import { Test } from '@nestjs/testing';
import { IikoSyncProcessor } from './iiko-sync.processor';
import { IikoSyncService } from './iiko-sync.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Job } from 'bullmq';

function makeJob(data: { tenantId: string; syncJobId: string }, attemptsMade = 0, attempts = 3): Partial<Job> {
  return { data, attemptsMade, opts: { attempts } } as Partial<Job>;
}

describe('IikoSyncProcessor', () => {
  let processor: IikoSyncProcessor;
  let mockSyncService: { syncForTenant: jest.Mock };
  let mockPrisma: { posSyncJob: { update: jest.Mock } };

  beforeEach(async () => {
    mockSyncService = { syncForTenant: jest.fn().mockResolvedValue(undefined) };
    mockPrisma = { posSyncJob: { update: jest.fn().mockResolvedValue({}) } };

    const module = await Test.createTestingModule({
      providers: [
        IikoSyncProcessor,
        { provide: IikoSyncService, useValue: mockSyncService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    processor = module.get(IikoSyncProcessor);
  });

  it('marks job RUNNING then SUCCESS on successful sync', async () => {
    const job = makeJob({ tenantId: 'tenant-1', syncJobId: 'job-1' });

    await processor.process(job as Job);

    expect(mockPrisma.posSyncJob.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ status: 'RUNNING' }) }),
    );
    expect(mockSyncService.syncForTenant).toHaveBeenCalledWith('tenant-1');
    expect(mockPrisma.posSyncJob.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCESS' }) }),
    );
  });

  it('rethrows errors so BullMQ can retry', async () => {
    const syncError = new Error('iiko unavailable');
    mockSyncService.syncForTenant.mockRejectedValue(syncError);

    const job = makeJob({ tenantId: 'tenant-1', syncJobId: 'job-1' });

    await expect(processor.process(job as Job)).rejects.toThrow('iiko unavailable');
  });

  it('marks job UNAVAILABLE on handleFailure after all retries exhausted', async () => {
    const job = makeJob({ tenantId: 'tenant-1', syncJobId: 'job-1' }, 3, 3);

    await processor.handleFailure(job as Job, new Error('Connection refused'));

    expect(mockPrisma.posSyncJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          status: 'UNAVAILABLE',
          error: 'Connection refused',
        }),
      }),
    );
  });
});
