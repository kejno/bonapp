import { HttpException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { StaffAuthService } from './staff-auth.service';
import { buildTokenPair } from './staff-jwt.util';

const TEST_SECRET = 'test-jwt-secret';
const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';

function makeConfig(): ConfigService {
  return { getOrThrow: () => TEST_SECRET } as unknown as ConfigService;
}

function makeRedis(store: Record<string, string> = {}) {
  const s: Record<string, { value: string; ttl: number }> = {};
  for (const [k, v] of Object.entries(store)) {
    s[k] = { value: v, ttl: 999 };
  }
  return {
    get: jest.fn((key: string) => Promise.resolve(s[key]?.value ?? null)),
    set: jest.fn((key: string, value: string, _ex: string, ttl: number) => {
      s[key] = { value, ttl };
      return Promise.resolve('OK');
    }),
    del: jest.fn((key: string) => {
      delete s[key];
      return Promise.resolve(1);
    }),
    incr: jest.fn((key: string) => {
      const current = parseInt(s[key]?.value ?? '0', 10);
      s[key] = { value: String(current + 1), ttl: 60 };
      return Promise.resolve(current + 1);
    }),
    expire: jest.fn(() => Promise.resolve(1)),
    exists: jest.fn((key: string) => Promise.resolve(s[key] ? 1 : 0)),
  };
}

async function makeUserHash(password: string): Promise<string> {
  return bcrypt.hash(password, 1);
}

describe('StaffAuthService', () => {
  describe('login', () => {
    it('returns tokens and mustChangePassword on valid credentials', async () => {
      const hash = await makeUserHash('correctpass');
      const prisma = {
        forTenant: () => ({
          user: {
            findFirst: jest.fn().mockResolvedValue({
              id: USER_ID,
              role: 'WAITER',
              mustChangePassword: true,
              passwordHash: hash,
            }),
            update: jest.fn().mockResolvedValue({}),
          },
        }),
      };
      const redis = makeRedis();
      const service = new StaffAuthService(
        prisma as never,
        redis as never,
        makeConfig(),
      );

      const result = await service.login(
        TENANT_ID,
        'staff@test.com',
        'correctpass',
        '127.0.0.1',
      );

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.mustChangePassword).toBe(true);
    });

    it('throws 401 on wrong password', async () => {
      const hash = await makeUserHash('correctpass');
      const prisma = {
        forTenant: () => ({
          user: {
            findFirst: jest.fn().mockResolvedValue({
              id: USER_ID,
              role: 'WAITER',
              mustChangePassword: false,
              passwordHash: hash,
            }),
            update: jest.fn().mockResolvedValue({}),
          },
        }),
      };
      const redis = makeRedis();
      const service = new StaffAuthService(
        prisma as never,
        redis as never,
        makeConfig(),
      );

      await expect(
        service.login(TENANT_ID, 'staff@test.com', 'wrongpass', '127.0.0.1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws 401 when user not found', async () => {
      const prisma = {
        forTenant: () => ({
          user: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        }),
      };
      const redis = makeRedis();
      const service = new StaffAuthService(
        prisma as never,
        redis as never,
        makeConfig(),
      );

      await expect(
        service.login(TENANT_ID, 'missing@test.com', 'anypass', '127.0.0.1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws 429 on the 6th login attempt from the same IP', async () => {
      const hash = await makeUserHash('wrongpass');
      const prisma = {
        forTenant: () => ({
          user: {
            findFirst: jest.fn().mockResolvedValue({
              id: USER_ID,
              role: 'WAITER',
              mustChangePassword: false,
              passwordHash: hash,
            }),
          },
        }),
      };
      const redis = makeRedis({ 'login_attempts:1.2.3.4': '5' });
      const service = new StaffAuthService(
        prisma as never,
        redis as never,
        makeConfig(),
      );

      await expect(
        service.login(TENANT_ID, 'staff@test.com', 'anypass', '1.2.3.4'),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('increments attempts counter on wrong password', async () => {
      const hash = await makeUserHash('correctpass');
      const prisma = {
        forTenant: () => ({
          user: {
            findFirst: jest.fn().mockResolvedValue({
              id: USER_ID,
              role: 'WAITER',
              mustChangePassword: false,
              passwordHash: hash,
            }),
          },
        }),
      };
      const redis = makeRedis();
      const service = new StaffAuthService(
        prisma as never,
        redis as never,
        makeConfig(),
      );

      await expect(
        service.login(TENANT_ID, 'staff@test.com', 'wrongpass', '5.6.7.8'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(redis.incr).toHaveBeenCalledWith('login_attempts:5.6.7.8');
    });
  });

  describe('refresh', () => {
    it('returns new token pair for a valid refresh token', async () => {
      const { refreshToken } = buildTokenPair(
        USER_ID,
        TENANT_ID,
        'WAITER',
        TEST_SECRET,
      );
      const redis = makeRedis();
      const service = new StaffAuthService(
        {} as never,
        redis as never,
        makeConfig(),
      );

      const result = await service.refresh(refreshToken);

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.refreshToken).not.toBe(refreshToken);
    });

    it('blacklists the old refresh token after rotation', async () => {
      const { refreshToken } = buildTokenPair(
        USER_ID,
        TENANT_ID,
        'WAITER',
        TEST_SECRET,
      );
      const redis = makeRedis();
      const service = new StaffAuthService(
        {} as never,
        redis as never,
        makeConfig(),
      );

      await service.refresh(refreshToken);

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^rt_blacklist:/),
        '1',
        'EX',
        expect.any(Number),
      );
    });

    it('throws 401 when refresh token is already blacklisted', async () => {
      const { refreshToken } = buildTokenPair(
        USER_ID,
        TENANT_ID,
        'WAITER',
        TEST_SECRET,
      );
      const redis = makeRedis();
      const existsSpy = jest.fn().mockResolvedValue(1);
      redis.exists = existsSpy;
      const service = new StaffAuthService(
        {} as never,
        redis as never,
        makeConfig(),
      );

      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws 401 when token type is access instead of refresh', async () => {
      const { accessToken } = buildTokenPair(
        USER_ID,
        TENANT_ID,
        'WAITER',
        TEST_SECRET,
      );
      const redis = makeRedis();
      const service = new StaffAuthService(
        {} as never,
        redis as never,
        makeConfig(),
      );

      await expect(service.refresh(accessToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('blacklists the refresh token on logout', async () => {
      const { refreshToken } = buildTokenPair(
        USER_ID,
        TENANT_ID,
        'WAITER',
        TEST_SECRET,
      );
      const redis = makeRedis();
      const service = new StaffAuthService(
        {} as never,
        redis as never,
        makeConfig(),
      );

      await service.logout(refreshToken);

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^rt_blacklist:/),
        '1',
        'EX',
        expect.any(Number),
      );
    });

    it('does not throw when given an invalid token (graceful logout)', async () => {
      const redis = makeRedis();
      const service = new StaffAuthService(
        {} as never,
        redis as never,
        makeConfig(),
      );

      await expect(service.logout('not-a-jwt')).resolves.toBeUndefined();
    });
  });

  describe('changePassword', () => {
    it('updates hash and clears mustChangePassword when credentials are correct', async () => {
      const hash = await makeUserHash('oldpass');
      const updateMock = jest.fn().mockResolvedValue({});
      const prisma = {
        forTenant: () => ({
          user: {
            findFirst: jest.fn().mockResolvedValue({
              id: USER_ID,
              passwordHash: hash,
            }),
            update: updateMock,
          },
        }),
      };
      const redis = makeRedis();
      const service = new StaffAuthService(
        prisma as never,
        redis as never,
        makeConfig(),
      );

      await service.changePassword(TENANT_ID, USER_ID, 'oldpass', 'newPass123');

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mustChangePassword: false }),
        }),
      );
    });

    it('throws 401 when current password is wrong', async () => {
      const hash = await makeUserHash('correctpass');
      const prisma = {
        forTenant: () => ({
          user: {
            findFirst: jest.fn().mockResolvedValue({
              id: USER_ID,
              passwordHash: hash,
            }),
          },
        }),
      };
      const redis = makeRedis();
      const service = new StaffAuthService(
        prisma as never,
        redis as never,
        makeConfig(),
      );

      await expect(
        service.changePassword(TENANT_ID, USER_ID, 'wrongpass', 'newPass123'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws 400 when new password is too short', async () => {
      const prisma = { forTenant: () => ({ user: { findFirst: jest.fn() } }) };
      const redis = makeRedis();
      const service = new StaffAuthService(
        prisma as never,
        redis as never,
        makeConfig(),
      );

      await expect(
        service.changePassword(TENANT_ID, USER_ID, 'oldpass', 'short'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
