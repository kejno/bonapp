import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { FiscalService, FISCAL_QUEUE } from './fiscal.service';
import { FiscalProcessor } from './fiscal.processor';
import { FiscalWorker } from './fiscal.worker';
import { SknoApiService } from './skno/skno-api.service';
import { SKNO_API_SERVICE } from './skno/skno-api.interface';
import { FISCALIZE_QUEUE_NAME } from './fiscal-queue.types';

@Module({
  providers: [
    {
      provide: FISCAL_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Queue(FISCALIZE_QUEUE_NAME, {
          connection: {
            host: config.get('REDIS_HOST', 'localhost'),
            port: config.get<number>('REDIS_PORT', 6379),
          },
        }),
    },
    { provide: SKNO_API_SERVICE, useClass: SknoApiService },
    FiscalService,
    FiscalProcessor,
    FiscalWorker,
  ],
  exports: [FiscalService],
})
export class FiscalModule {}
