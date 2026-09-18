import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import { FiscalProcessor } from './fiscal.processor';
import { FISCALIZE_QUEUE_NAME, FiscalizeJobData } from './fiscal-queue.types';

@Injectable()
export class FiscalWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FiscalWorker.name);
  private worker: Worker<FiscalizeJobData>;

  constructor(
    private readonly processor: FiscalProcessor,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const connection = {
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
    };

    this.worker = new Worker<FiscalizeJobData>(
      FISCALIZE_QUEUE_NAME,
      (job: Job<FiscalizeJobData>) => this.processor.process(job),
      {
        connection,
        settings: {
          backoffStrategy: (attemptsMade: number) => {
            if (attemptsMade === 1) return 5_000;
            if (attemptsMade === 2) return 30_000;
            return 0;
          },
        },
      },
    );

    this.worker.on('failed', (job, err) => {
      this.processor.onJobFailed(job, err);
    });

    this.logger.log('FiscalWorker started');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    this.logger.log('FiscalWorker stopped');
  }
}
