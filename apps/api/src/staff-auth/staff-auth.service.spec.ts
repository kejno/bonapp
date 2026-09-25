import { HttpException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { StaffAuthService } from './staff-auth.service';
import { buildTokenPair, verifyToken } from './staff-jwt.util';

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
    set: jest.fn((key: string, value: string, _ex: string, ttl: number, mode?: string) => {
      if (mode === 'NX' && s[key]) return Promise.resolve(null);
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
    eval: jest.fn((_script: string, _numKeys: number, key: string, ttl: string) => {
      const current = parseInt(s[key]?.value ?? '0', 10) + 1;
      s[key] = { value: String(current), ttl: Number(ttl) };
      return Promise.resolve(current);
    }),
  };
}

function makeActivePrisma(user: unknown = { id: USER_ID, isActive: true }) {
  return {
    forTenant: jest.fn(() => ({ user: { findFirst: jest.fn().mockResolvedValue(user) } })),
  };
}

async function makeUserHash(password: string): Promise<string> {
  return bcrypt.hash(password, 1);
}

describe('StaffAuthService', () => {
  describe('login', () => {
    it('atomically reserves a rate-limit slot before checking credentials', async () => {
      const prisma = {
        forTenant: () => ({ user: { findFirst: jest.fn().mockResolvedValue(null) } }),
      };
      const redis = makeRedis();
      const service = new StaffAuthService(prisma as never, redis as never, makeConfig());

      await expect(service.login(TENANT_ID, 'missing@test.com', 'pass', '8.8.8.8'))
        .rejects.toBeInstanceOf(UnauthorizedException);

      expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, 'login_attempts:8.8.8.8', '60');
    });
    it('allows at most five concurrent attempts from one IP', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const prisma = { forTenant: () => ({ user: { findFirst } }) };
      const service = new StaffAuthService(prisma as never, makeRedis() as never, makeConfig());

      const results = await Promise.allSettled(
        Array.from({ length: 6 }, () =>
          service.login(TENANT_ID, 'missing@test.com', 'pass', '8.8.4.4'),
        ),
      );

      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(6);
      expect(findFirst).toHaveBeenCalledTimes(5);
      expect(results.some((result) => result.status === 'rejected' && result.reason instanceof HttpException && result.reason.getStatus() === 429)).toBe(true);
    });
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

    it('rejects blocked staff accounts even when the password is valid', async () => {
      const hash = await makeUserHash('correctpass');
      const prisma = {
        forTenant: () => ({
          user: {
            findFirst: jest.fn().mockResolvedValue({
              id: USER_ID,
              role: 'WAITER',
              isBlocked: true,
              passwordHash: hash,
            }),
          },
        }),
      };
      const service = new StaffAuthService(prisma as never, makeRedis() as never, makeConfig());

      await expect(service.login(TENANT_ID, 'staff@test.com', 'correctpass', '127.0.0.1'))
        .rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('keeps successful attempts in the IP rate-limit window', async () => {
      const hash = await makeUserHash('correctpass');
      const prisma = {
        forTenant: () => ({
          user: {
            findFirst: jest.fn().mockResolvedValue({
              id: USER_ID,
              role: 'WAITER',
              isBlocked: false,
              mustChangePassword: false,
              passwordHash: hash,
            }),
            update: jest.fn().mockResolvedValue({}),
          },
        }),
      };
      const redis = makeRedis();
      const service = new StaffAuthService(prisma as never, redis as never, makeConfig());

      await service.login(TENANT_ID, 'staff@test.com', 'correctpass', '127.0.0.1');

      expect(redis.del).not.toHaveBeenCalled();
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

      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'login_attempts:5.6.7.8',
        '60',
      );
    });
  });

  describe('refresh', () => {
    it('uses the current database role when issuing rotated tokens', async () => {
      const { refreshToken } = buildTokenPair(USER_ID, TENANT_ID, 'WAITER', TEST_SECRET);
      const prisma = {
        forTenant: jest.fn(() => ({
          user: { findFirst: jest.fn().mockResolvedValue({ id: USER_ID, role: 'MANAGER' }) },
        })),
      };
      const service = new StaffAuthService(prisma as never, makeRedis() as never, makeConfig());

      const result = await service.refresh(refreshToken);

      expect(verifyToken(result.accessToken, TEST_SECRET).role).toBe('MANAGER');
      expect(verifyToken(result.refreshToken, TEST_SECRET).role).toBe('MANAGER');
    });
    it('returns new token pair for a valid refresh token', async () => {
      const { refreshToken } = buildTokenPair(
        USER_ID,
        TENANT_ID,
        'WAITER',
        TEST_SECRET,
      );
      const redis = makeRedis();
      const prisma = makeActivePrisma();
      const service = new StaffAuthService(
        prisma as never,
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
      const prisma = makeActivePrisma();
      const service = new StaffAuthService(
        prisma as never,
        redis as never,
        makeConfig(),
      );

      await service.refresh(refreshToken);

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^rt_blacklist:/),
        '1',
        'EX',
        expect.any(Number),
        'NX',
      );
    });

    it('throws 401 when refresh token is already blacklisted', async () => {
      const { refreshToken, refreshJti } = buildTokenPair(
        USER_ID,
        TENANT_ID,
        'WAITER',
        TEST_SECRET,
      );
      const redis = makeRedis({ [`rt_blacklist:${refreshJti}`]: '1' });
      const service = new StaffAuthService(
        makeActivePrisma() as never,
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
        makeActivePrisma() as never,
        redis as never,
        makeConfig(),
      );

      await expect(service.refresh(accessToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects refresh when the staff account is missing or inactive', async () => {
      const { refreshToken } = buildTokenPair(USER_ID, TENANT_ID, 'WAITER', TEST_SECRET);
      const redis = makeRedis();
      const service = new StaffAuthService(makeActivePrisma(null) as never, redis as never, makeConfig());

      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('rejects refresh for blocked staff accounts', async () => {
      const { refreshToken } = buildTokenPair(USER_ID, TENANT_ID, 'WAITER', TEST_SECRET);
      const redis = makeRedis();
      const prisma = {
        forTenant: () => ({
          user: {
            findFirst: jest.fn().mockResolvedValue({
              id: USER_ID,
              role: 'WAITER',
              isBlocked: true,
            }),
          },
        }),
      };
      const service = new StaffAuthService(prisma as never, redis as never, makeConfig());

      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('allows only one of two concurrent refreshes to rotate the same token', async () => {
      const { refreshToken } = buildTokenPair(USER_ID, TENANT_ID, 'WAITER', TEST_SECRET);
      const redis = makeRedis();
      const service = new StaffAuthService(makeActivePrisma() as never, redis as never, makeConfig());

      const results = await Promise.allSettled([
        service.refresh(refreshToken),
        service.refresh(refreshToken),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
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
          data: expect.objectContaining({ mustChangePassword: false }) as unknown,
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
