import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { POS_QUEUE, SendOrderJobData, SyncMenuJobData } from './pos-queue.service';
import { PosService } from './pos.service';

@Injectable()
export class PosWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PosWorkerService.name);
  private worker!: Worker;

  constructor(
    private readonly config: ConfigService,
    private readonly posService: PosService,
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      POS_QUEUE,
      async (job) => {
        if (job.name === 'sync-menu') {
          const data = job.data as SyncMenuJobData;
          await this.posService.dispatchSyncMenu(data.tenantId);
        } else if (job.name === 'send-order') {
          const data = job.data as SendOrderJobData;
          await this.posService.dispatchSendOrder(data.tenantId, data.orderId);
        }
      },
      {
        connection: {
          host: this.config.get<string>('REDIS_HOST', 'localhost'),
          port: this.config.get<number>('REDIS_PORT', 6379),
        },
      },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `POS job ${job?.id ?? '?'} (${job?.name ?? '?'}) failed: ${err.message}`,
      );
    });
    this.logger.log('POS worker started');
  }

  async onModuleDestroy() {
    await this.worker.close();
  }
}
