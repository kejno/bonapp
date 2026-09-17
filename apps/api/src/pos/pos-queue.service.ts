import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export const POS_QUEUE = 'pos';

export interface SyncMenuJobData {
  tenantId: string;
}

export interface SendOrderJobData {
  tenantId: string;
  orderId: string;
}

@Injectable()
export class PosQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PosQueueService.name);
  private queue!: Queue;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.queue = new Queue(POS_QUEUE, {
      connection: {
        host: this.config.get<string>('REDIS_HOST', 'localhost'),
        port: this.config.get<number>('REDIS_PORT', 6379),
      },
    });
    this.logger.log('POS queue initialized');
  }

  async addSyncMenuJob(tenantId: string): Promise<string> {
    const job = await this.queue.add('sync-menu', { tenantId } satisfies SyncMenuJobData);
    return job.id ?? '';
  }

  async addSendOrderJob(tenantId: string, orderId: string): Promise<string> {
    const job = await this.queue.add('send-order', {
      tenantId,
      orderId,
    } satisfies SendOrderJobData);
    return job.id ?? '';
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
