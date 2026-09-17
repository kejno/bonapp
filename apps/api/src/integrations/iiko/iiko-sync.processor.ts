import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { IikoSyncService } from './iiko-sync.service';

export interface IikoSyncJobData {
  tenantId: string;
  syncJobId: string;
}

@Injectable()
export class IikoSyncProcessor {
  constructor(
    private readonly syncService: IikoSyncService,
    private readonly prisma: PrismaService,
  ) {}

  async process(job: Job<IikoSyncJobData>): Promise<void> {
    const { tenantId, syncJobId } = job.data;

    await this.prisma.posSyncJob.update({
      where: { id: syncJobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    await this.syncService.syncForTenant(tenantId);

    await this.prisma.posSyncJob.update({
      where: { id: syncJobId },
      data: { status: 'SUCCESS', completedAt: new Date() },
    });
  }

  async handleFailure(job: Job<IikoSyncJobData>, error: Error): Promise<void> {
    const { syncJobId } = job.data;
    await this.prisma.posSyncJob.update({
      where: { id: syncJobId },
      data: {
        status: 'UNAVAILABLE',
        completedAt: new Date(),
        error: error.message,
      },
    });
  }
}
