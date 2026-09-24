import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hashSync } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, verifyTOTP } from './auth.service';

const TEST_SECRET = 'test-jwt-secret-32-chars-minimum!';

function makeService(
  userRow: Record<string, unknown> | null,
): { service: AuthService; findFirstMock: jest.Mock } {
  const findFirstMock = jest.fn().mockResolvedValue(userRow);
  const prisma = {
    unscopedClient: { user: { findFirst: findFirstMock } },
  } as unknown as PrismaService;
  const config = {
    getOrThrow: () => TEST_SECRET,
  } as unknown as ConfigService;
  return { service: new AuthService(prisma, config), findFirstMock };
}

const PASSWORD = 'correct-password';
const PASSWORD_HASH = hashSync(PASSWORD, 4);

const BASE_USER = {
  id: 'user-uuid',
  tenantId: 'tenant-uuid',
  email: 'admin@example.com',
  passwordHash: PASSWORD_HASH,
  fullName: 'Admin User',
  role: 'OWNER',
  isBlocked: false,
  totpEnabled: false,
  totpSecret: null,
};

describe('AuthService', () => {
  describe('login', () => {
    it('throws when user is not found', async () => {
      const { service } = makeService(null);
      await expect(
        service.login({ login: 'unknown@example.com', password: PASSWORD }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws when account is blocked', async () => {
      const { service } = makeService({ ...BASE_USER, isBlocked: true });
      await expect(
        service.login({ login: BASE_USER.email, password: PASSWORD }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws when password is wrong', async () => {
      const { service } = makeService(BASE_USER);
      await expect(
        service.login({ login: BASE_USER.email, password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns requiresTOTP when TOTP is enabled and no code provided', async () => {
      const { service } = makeService({
        ...BASE_USER,
        totpEnabled: true,
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });
      const result = await service.login({
        login: BASE_USER.email,
        password: PASSWORD,
      });
      expect(result).toEqual({ requiresTOTP: true });
    });

    it('throws when TOTP code is invalid', async () => {
      const { service } = makeService({
        ...BASE_USER,
        totpEnabled: true,
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });
      await expect(
        service.login({
          login: BASE_USER.email,
          password: PASSWORD,
          totpCode: '000000',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns accessToken and user on successful login without TOTP', async () => {
      const { service } = makeService(BASE_USER);
      const result = await service.login({
        login: BASE_USER.email,
        password: PASSWORD,
      });
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user).toMatchObject({
        id: BASE_USER.id,
        email: BASE_USER.email,
        role: BASE_USER.role,
        tenantId: BASE_USER.tenantId,
      });
    });

    it('normalises email to lowercase before querying', async () => {
      const { service, findFirstMock } = makeService(BASE_USER);
      await service.login({ login: 'Admin@Example.COM', password: PASSWORD });
      const calls = findFirstMock.mock.calls as [
        { where: { OR: { email?: string }[] } },
      ][];
      const callArg = calls[0][0];
      const emailInQuery = callArg.where.OR.find((c) => 'email' in c)?.email;
      expect(emailInQuery).toBe('admin@example.com');
    });

    it('returns accessToken for two users with different tenants (multi-tenant)', async () => {
      const user1 = { ...BASE_USER, tenantId: 'tenant-1' };
      const user2 = { ...BASE_USER, tenantId: 'tenant-2' };
      const { service: s1 } = makeService(user1);
      const { service: s2 } = makeService(user2);

      const r1 = await s1.login({ login: BASE_USER.email, password: PASSWORD });
      const r2 = await s2.login({ login: BASE_USER.email, password: PASSWORD });

      expect(r1.accessToken).toBeDefined();
      expect(r2.accessToken).toBeDefined();
      expect(r1.user?.tenantId).toBe('tenant-1');
      expect(r2.user?.tenantId).toBe('tenant-2');
    });
  });

  describe('generateToken', () => {
    it('produces a valid HS256 JWT with required claims', () => {
      const { service } = makeService(BASE_USER);
      const token = service.generateToken(BASE_USER, 3600, 'access');
      const [header, payload] = token.split('.');
      const h = JSON.parse(Buffer.from(header, 'base64url').toString()) as {
        alg: string;
        typ: string;
      };
      const p = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
        sub: string;
        tenantId: string;
        exp: number;
      };

      expect(h).toEqual({ alg: 'HS256', typ: 'JWT' });
      expect(p.sub).toBe(BASE_USER.id);
      expect(p.tenantId).toBe(BASE_USER.tenantId);
      expect(typeof p.exp).toBe('number');
      expect(p.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });
});

describe('verifyTOTP', () => {
  it('returns false for an obviously wrong code', () => {
    expect(verifyTOTP('JBSWY3DPEHPK3PXP', '000000')).toBe(false);
  });

  it('returns false for a non-numeric code', () => {
    expect(verifyTOTP('JBSWY3DPEHPK3PXP', 'abcdef')).toBe(false);
  });
});
