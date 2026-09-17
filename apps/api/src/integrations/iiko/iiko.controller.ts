import {
  Controller,
  Post,
  Get,
  Inject,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { SyncStatusResponse } from './iiko.types';

const SYNC_ATTEMPTS = 3;

@Controller('api/v1/admin/pos')
export class IikoController {
  constructor(
    @Inject('IIKO_SYNC_QUEUE') private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  @Post('sync-menu')
  async triggerSync(@TenantId() tenantId: string): Promise<{ syncJobId: string }> {
    if (!tenantId) {
      throw new BadRequestException('x-tenant-id header is required');
    }

    const activeJob = await this.prisma.posSyncJob.findFirst({
      where: {
        tenantId,
        provider: 'IIKO',
        status: { in: ['PENDING', 'RUNNING'] },
      },
    });

    if (activeJob) {
      throw new ConflictException('iiko sync is already in progress');
    }

    const syncJob = await this.prisma.posSyncJob.create({
      data: { tenantId, provider: 'IIKO', status: 'PENDING' },
    });

    await this.queue.add(
      'iiko-sync-menu',
      { tenantId, syncJobId: syncJob.id },
      { attempts: SYNC_ATTEMPTS, backoff: { type: 'exponential', delay: 5000 } },
    );

    return { syncJobId: syncJob.id };
  }

  @Get('sync-status')
  async getSyncStatus(@TenantId() tenantId: string): Promise<SyncStatusResponse> {
    if (!tenantId) {
      throw new BadRequestException('x-tenant-id header is required');
    }

    const latestJob = await this.prisma.posSyncJob.findFirst({
      where: { tenantId, provider: 'IIKO' },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestJob) {
      return { status: null, startedAt: null, completedAt: null, error: null };
    }

    return {
      status: latestJob.status as SyncStatusResponse['status'],
      startedAt: latestJob.startedAt?.toISOString() ?? null,
      completedAt: latestJob.completedAt?.toISOString() ?? null,
      error: latestJob.error,
    };
  }
}
