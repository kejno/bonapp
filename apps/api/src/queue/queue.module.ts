import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const REDIS_CONNECTION = 'REDIS_CONNECTION';
export const WEBHOOK_QUEUE = 'WEBHOOK_QUEUE';
export const WEBHOOK_QUEUE_NAME = 'payment-webhooks';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CONNECTION,
      useFactory: (config: ConfigService) =>
        new IORedis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          maxRetriesPerRequest: null,
        }),
      inject: [ConfigService],
    },
    {
      provide: WEBHOOK_QUEUE,
      useFactory: (redis: IORedis) =>
        new Queue(WEBHOOK_QUEUE_NAME, { connection: redis }),
      inject: [REDIS_CONNECTION],
    },
  ],
  exports: [REDIS_CONNECTION, WEBHOOK_QUEUE],
})
export class QueueModule {}
