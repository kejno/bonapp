import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class MenuCacheService implements OnModuleDestroy {
  private readonly redis?: Redis;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL');
    if (url)
      this.redis = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
  }

  async invalidate(tenantId: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(`menu:${tenantId}`);
    } catch {
      // Cache availability must not prevent menu mutations.
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }
}
