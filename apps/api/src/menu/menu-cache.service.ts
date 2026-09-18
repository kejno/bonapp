import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class MenuCacheService implements OnModuleDestroy {
  private readonly redis?: Redis;

  constructor(config: ConfigService) {
    const redisUrl = config.get<string>('REDIS_URL');
    if (redisUrl) this.redis = new Redis(redisUrl);
  }

  async invalidateGuestMenu(tenantId: string): Promise<void> {
    if (this.redis) await this.redis.unlink(`guest-menu:${tenantId}`);
  }

  async onModuleDestroy() {
    await this.redis?.quit();
  }
}
