import { Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  it('logs Redis failures and preserves the cache-as-optimization contract', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const redis = {
      get: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
      set: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
      del: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    };
    const service = new CacheService(redis as never);

    await expect(service.getJson('menu:tenant:tenant-1')).resolves.toBeNull();
    await expect(
      service.setJson('menu:tenant:tenant-1', [], 60),
    ).resolves.toBeUndefined();
    await expect(service.del('menu:tenant:tenant-1')).resolves.toBeUndefined();
  });

  describe('increment', () => {
    it('increments a key and sets TTL on first call', async () => {
      const redis = {
        incr: jest.fn().mockResolvedValue(1),
        expire: jest.fn().mockResolvedValue(1),
      };
      const service = new CacheService(redis as never);

      const result = await service.increment('pin:attempts:t1:ip', 900);

      expect(result).toBe(1);
      expect(redis.incr).toHaveBeenCalledWith('pin:attempts:t1:ip');
      expect(redis.expire).toHaveBeenCalledWith('pin:attempts:t1:ip', 900);
    });

    it('does not reset TTL on subsequent increments', async () => {
      const redis = {
        incr: jest.fn().mockResolvedValue(3),
        expire: jest.fn().mockResolvedValue(1),
      };
      const service = new CacheService(redis as never);

      const result = await service.increment('pin:attempts:t1:ip', 900);

      expect(result).toBe(3);
      expect(redis.expire).not.toHaveBeenCalled();
    });

    it('fails closed when Redis is unavailable', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const redis = {
        incr: jest.fn().mockRejectedValue(new Error('Redis down')),
      };
      const service = new CacheService(redis as never);

      await expect(service.increment('key', 60)).rejects.toThrow(
        'Rate limiting is temporarily unavailable',
      );
    });
  });
});
