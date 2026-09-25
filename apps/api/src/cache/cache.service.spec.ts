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

  describe('setJsonRequired', () => {
    it('stores a required value and fails closed when Redis is unavailable', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const redis = { set: jest.fn().mockResolvedValue('OK') };
      const service = new CacheService(redis as never);

      await expect(service.setJsonRequired('totp:challenge:id', { type: 'login' }, 180)).resolves.toBeUndefined();
      expect(redis.set).toHaveBeenCalledWith('totp:challenge:id', '{"type":"login"}', 'EX', 180);

      const unavailable = new CacheService({ set: jest.fn().mockRejectedValue(new Error('Redis down')) } as never);
      await expect(unavailable.setJsonRequired('totp:challenge:id', { type: 'login' }, 180)).rejects.toThrow('temporarily unavailable');
    });
  });

  describe('increment', () => {
    it('increments and sets the initial TTL in one atomic Redis script', async () => {
      const redis = { eval: jest.fn().mockResolvedValue(1) };
      const service = new CacheService(redis as never);

      const result = await service.increment('pin:attempts:t1:ip', 900);

      expect(result).toBe(1);
      expect(redis.eval).toHaveBeenCalledTimes(1);
      expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, 'pin:attempts:t1:ip', '900');
    });

    it('preserves the existing TTL on subsequent increments', async () => {
      const redis = { eval: jest.fn().mockResolvedValue(3) };
      const service = new CacheService(redis as never);

      await expect(service.increment('pin:attempts:t1:ip', 900)).resolves.toBe(3);
      expect(redis.eval).toHaveBeenCalledTimes(1);
    });

    it('fails closed when Redis is unavailable', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const redis = { eval: jest.fn().mockRejectedValue(new Error('Redis down')) };
      const service = new CacheService(redis as never);

      await expect(service.increment('key', 60)).rejects.toThrow(
        'Rate limiting is temporarily unavailable',
      );
    });
  });

  describe('consumeJson', () => {
    it('uses atomic Redis GETDEL and parses the value', async () => {
      const payload = { type: 'login', userId: 'u1' };
      const redis = { getdel: jest.fn().mockResolvedValue(JSON.stringify(payload)) };
      const service = new CacheService(redis as never);
      await expect(service.consumeJson('totp:challenge:id')).resolves.toEqual(payload);
      expect(redis.getdel).toHaveBeenCalledWith('totp:challenge:id');
    });

    it('fails closed when Redis cannot consume a challenge', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const service = new CacheService({ getdel: jest.fn().mockRejectedValue(new Error('Redis down')) } as never);
      await expect(service.consumeJson('totp:challenge:id')).rejects.toThrow('temporarily unavailable');
    });
  });

  describe('setJsonIfAbsent', () => {
    it('uses atomic SET EX NX and returns whether the key was claimed', async () => {
      const redis = { set: jest.fn().mockResolvedValue('OK') };
      const service = new CacheService(redis as never);
      await expect(service.setJsonIfAbsent('totp:used:u1:1', 1, 120)).resolves.toBe(true);
      expect(redis.set).toHaveBeenCalledWith('totp:used:u1:1', '1', 'EX', 120, 'NX');
    });

    it('returns false when another request already claimed the key', async () => {
      const service = new CacheService({ set: jest.fn().mockResolvedValue(null) } as never);
      await expect(service.setJsonIfAbsent('key', 1, 60)).resolves.toBe(false);
    });

    it('fails closed when Redis is unavailable', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const service = new CacheService({ set: jest.fn().mockRejectedValue(new Error('Redis down')) } as never);
      await expect(service.setJsonIfAbsent('key', 1, 60)).rejects.toThrow('temporarily unavailable');
    });
  });
});
