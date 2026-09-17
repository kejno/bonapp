import {
  Module,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { IikoCryptoService } from './iiko-crypto.service';
import { IikoAuthService } from './iiko-auth.service';
import { IikoNomenclatureService } from './iiko-nomenclature.service';
import { IikoSyncService } from './iiko-sync.service';
import { IikoSyncProcessor } from './iiko-sync.processor';
import { IikoController } from './iiko.controller';

@Module({
  controllers: [IikoController],
  providers: [
    {
      provide: 'IIKO_SYNC_QUEUE',
      useFactory: (config: ConfigService) => {
        const connection = new IORedis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          maxRetriesPerRequest: null,
        });
        return new Queue('iiko-sync-menu', { connection });
      },
      inject: [ConfigService],
    },
    IikoCryptoService,
    IikoAuthService,
    IikoNomenclatureService,
    IikoSyncService,
    IikoSyncProcessor,
  ],
})
export class IikoModule implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null;

  constructor(
    private readonly processor: IikoSyncProcessor,
    @Inject('IIKO_SYNC_QUEUE') private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const connection = new IORedis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      maxRetriesPerRequest: null,
    });

    this.worker = new Worker(
      'iiko-sync-menu',
      (job) => this.processor.process(job),
      { connection },
    );

    this.worker.on('failed', (job, error) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        void this.processor.handleFailure(job, error);
      }
    });
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
    await this.queue.close();
  }
}
