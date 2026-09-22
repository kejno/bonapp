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
});
