import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PdfCache } from './table-tent-pdf.service';

@Injectable()
export class RedisPdfCacheService implements PdfCache, OnModuleDestroy {
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis(
      config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
      {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      },
    );
  }

  async get(key: string): Promise<Buffer | undefined> {
    const value = await this.redis.getBuffer(key);
    return value ?? undefined;
  }

  async set(key: string, value: Buffer, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
