import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './cache.constants';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      return value === null ? null : (JSON.parse(value) as T);
    } catch (error) {
      this.logCacheError('read', key, error);
      return null;
    }
  }

  async consumeJson<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.getdel(key);
      return value === null ? null : (JSON.parse(value) as T);
    } catch (error) {
      this.logCacheError('consume', key, error);
      throw new ServiceUnavailableException('Authentication challenge storage is temporarily unavailable');
    }
  }

  async setJson(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logCacheError('write', key, error);
    }
  }

  async setJsonIfAbsent(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<boolean> {
    try {
      const result = await this.redis.set(
        key,
        JSON.stringify(value),
        'EX',
        ttlSeconds,
        'NX',
      );
      return result === 'OK';
    } catch (error) {
      this.logCacheError('set if absent', key, error);
      throw new ServiceUnavailableException('Cache temporarily unavailable');
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logCacheError('invalidate', key, error);
    }
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, ttlSeconds);
      }
      return count;
    } catch (error) {
      this.logCacheError('increment', key, error);
      throw new ServiceUnavailableException('Rate limiting is temporarily unavailable');
    }
  }

  private logCacheError(operation: string, key: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Unable to ${operation} cache key ${key}: ${message}`);
  }
}
