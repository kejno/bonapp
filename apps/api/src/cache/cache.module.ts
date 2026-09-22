import { Global, Inject, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './cache.constants';
import { CacheService } from './cache.service';

class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('CacheModule');
        const client = new Redis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get<string>('REDIS_PORT', '6379')),
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 0,
        });
        client.on('error', (err: Error) => {
          logger.warn(`Redis connection error: ${err.message}`);
        });
        return client;
      },
    },
    CacheService,
    RedisLifecycle,
  ],
  exports: [CacheService],
})
export class CacheModule {}
