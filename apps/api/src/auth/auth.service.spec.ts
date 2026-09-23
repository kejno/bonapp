import { ForbiddenException, TooManyRequestsException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcryptjs';
import {
  AuthService,
  buildOtpAuthUri,
  decryptTotpSecret,
  totpGenerateSecret,
  totpVerify,
} from './auth.service';

const TEST_ENCRYPTION_KEY = 'a'.repeat(64); // 32-byte hex key (test only)
const TEST_JWT_SECRET = 'test-jwt-secret';

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    JWT_SECRET: TEST_JWT_SECRET,
    TOTP_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    APP_NAME: 'TestApp',
    ...overrides,
  };
  return {
    getOrThrow: (key: string) => {
      if (!(key in values)) throw new Error(`Config key "${key}" not found`);
      return values[key];
    },
    get: (key: string, def: string) => values[key] ?? def,
  } as unknown as ConfigService;
}

function makeService(
  prisma: unknown,
  cache: unknown,
  config: ConfigService = makeConfig(),
): AuthService {
  return new AuthService(
    prisma as never,
    cache as never,
    config,
  );
}

describe('AuthService — unit helpers', () => {
  describe('totpGenerateSecret', () => {
    it('returns a non-empty base32 string', () => {
      const { secretBase32 } = totpGenerateSecret();
      expect(secretBase32).toMatch(/^[A-Z2-7]+$/);
      expect(secretBase32.length).toBeGreaterThanOrEqual(32);
    });

    it('generates unique secrets on each call', () => {
      const a = totpGenerateSecret();
      const b = totpGenerateSecret();
      expect(a.secretBase32).not.toBe(b.secretBase32);
    });
  });

  describe('totpVerify', () => {
    it('accepts the current TOTP code generated from the same secret', () => {
      const { secretBase32 } = totpGenerateSecret();
      const { createHmac } = require('node:crypto');
      const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

      function b32decode(s: string): Buffer {
        const bytes: number[] = [];
        let bits = 0, v = 0;
        for (const c of s.replace(/=+$/, '')) {
          const idx = BASE32.indexOf(c);
          v = (v << 5) | idx;
          bits += 5;
          if (bits >= 8) { bits -= 8; bytes.push((v >> bits) & 0xff); }
        }
        return Buffer.from(bytes);
      }

      function genCode(secret: string): string {
        const key = b32decode(secret);
        const step = Math.floor(Date.now() / 1000 / 30);
        const buf = Buffer.allocUnsafe(8);
        buf.writeUInt32BE(Math.floor(step / 0x100000000), 0);
        buf.writeUInt32BE(step >>> 0, 4);
        const hmac = createHmac('sha1', key).update(buf).digest();
        const offset = hmac[19] & 0xf;
        const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset+1] & 0xff) << 16) | ((hmac[offset+2] & 0xff) << 8) | (hmac[offset+3] & 0xff);
        return String(code % 1_000_000).padStart(6, '0');
      }

      const code = genCode(secretBase32);
      expect(totpVerify(secretBase32, code)).toBe(true);
    });

    it('rejects an incorrect code', () => {
      const { secretBase32 } = totpGenerateSecret();
      expect(totpVerify(secretBase32, '000000')).toBe(false);
    });
  });

  describe('decryptTotpSecret', () => {
    it('round-trips an encrypted secret', () => {
      const keyBuf = Buffer.from(TEST_ENCRYPTION_KEY, 'hex');
      const { createCipheriv, randomBytes } = require('node:crypto');
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', keyBuf, iv);
      const encrypted = Buffer.concat([cipher.update('MYSECRET', 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      const stored = `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
      expect(decryptTotpSecret(stored, keyBuf)).toBe('MYSECRET');
    });
  });

  describe('buildOtpAuthUri', () => {
    it('returns a valid otpauth URI with all fields', () => {
      const uri = buildOtpAuthUri('SECRET', 'user@example.com', 'MyApp');
      expect(uri).toContain('otpauth://totp/');
      expect(uri).toContain('secret=SECRET');
      expect(uri).toContain('issuer=MyApp');
    });
  });
});

describe('AuthService — constructor', () => {
  it('throws when TOTP_ENCRYPTION_KEY is not 64 hex chars', () => {
    const prisma = {};
    const cache = {};
    const config = {
      getOrThrow: (key: string) => {
        if (key === 'JWT_SECRET') return 'secret';
        if (key === 'TOTP_ENCRYPTION_KEY') return 'short';
        throw new Error(`Unknown key ${key}`);
      },
      get: (_: string, d: string) => d,
    } as unknown as ConfigService;
    expect(() => makeService(prisma, cache, config)).toThrow('TOTP_ENCRYPTION_KEY');
  });
});

describe('AuthService — pinLogin', () => {
  const tenantId = 'tenant-1';
  const tenantSlug = 'my-restaurant';
  const pin = '1234';

  async function buildPrisma(pinHashOverride?: string) {
    const pinHash = pinHashOverride ?? (await hash(pin, 10));
    return {
      findTenantBySlug: jest.fn().mockResolvedValue({ id: tenantId, slug: tenantSlug }),
      forTenant: jest.fn().mockReturnValue({
        user: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'user-1', role: 'CASHIER', pinHash },
          ]),
        },
      }),
    };
  }

  it('returns a JWT when PIN matches', async () => {
    const prisma = await buildPrisma();
    const cache = {
      increment: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const service = makeService(prisma, cache);

    const result = await service.pinLogin(tenantSlug, pin, '127.0.0.1');

    expect(result).toHaveProperty('accessToken');
    expect(typeof result.accessToken).toBe('string');
    expect(result.accessToken.split('.').length).toBe(3);
  });

  it('clears the rate-limit counter after a successful login', async () => {
    const prisma = await buildPrisma();
    const del = jest.fn().mockResolvedValue(undefined);
    const cache = {
      increment: jest.fn().mockResolvedValue(1),
      del,
    };
    const service = makeService(prisma, cache);

    await service.pinLogin(tenantSlug, pin, '127.0.0.1');

    expect(del).toHaveBeenCalledWith(`pin:attempts:${tenantId}:127.0.0.1`);
  });

  it('throws 401 when tenant slug does not exist', async () => {
    const prisma = {
      findTenantBySlug: jest.fn().mockResolvedValue(null),
      forTenant: jest.fn(),
    };
    const cache = { increment: jest.fn().mockResolvedValue(1) };
    const service = makeService(prisma, cache);

    await expect(service.pinLogin('bad-slug', pin, '127.0.0.1')).rejects.toThrow(UnauthorizedException);
  });

  it('throws 401 when no staff user PIN matches', async () => {
    const prisma = await buildPrisma();
    const cache = {
      increment: jest.fn().mockResolvedValue(1),
    };
    const service = makeService(prisma, cache);

    await expect(service.pinLogin(tenantSlug, '9999', '127.0.0.1')).rejects.toThrow(UnauthorizedException);
  });

  it('throws 429 when rate limit is exceeded', async () => {
    const prisma = {
      findTenantBySlug: jest.fn().mockResolvedValue({ id: tenantId }),
      forTenant: jest.fn(),
    };
    const cache = { increment: jest.fn().mockResolvedValue(6) };
    const service = makeService(prisma, cache);

    await expect(service.pinLogin(tenantSlug, pin, '1.2.3.4')).rejects.toThrow(TooManyRequestsException);
    expect(prisma.forTenant).not.toHaveBeenCalled();
  });

  it('checks multiple staff users and returns match on second user', async () => {
    const pinHash1 = await hash('9999', 10);
    const pinHash2 = await hash('1234', 10);
    const prisma = {
      findTenantBySlug: jest.fn().mockResolvedValue({ id: tenantId }),
      forTenant: jest.fn().mockReturnValue({
        user: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'user-1', role: 'CASHIER', pinHash: pinHash1 },
            { id: 'user-2', role: 'WAITER', pinHash: pinHash2 },
          ]),
        },
      }),
    };
    const cache = {
      increment: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const service = makeService(prisma, cache);

    const result = await service.pinLogin(tenantSlug, '1234', '127.0.0.1');

    expect(result.accessToken).toBeDefined();
  });
});

describe('AuthService — login', () => {
  const tenantSlug = 'my-restaurant';
  const tenantId = 'tenant-1';
  const email = 'owner@example.com';
  const password = 'secret123';

  async function buildPrisma(totpEnabled = false) {
    const passwordHash = await hash(password, 10);
    return {
      findTenantBySlug: jest.fn().mockResolvedValue({ id: tenantId }),
      forTenant: jest.fn().mockReturnValue({
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'user-owner',
            role: 'OWNER',
            passwordHash,
            totpEnabled,
            isActive: true,
          }),
        },
      }),
    };
  }

  it('returns a JWT for valid credentials when TOTP is not enabled', async () => {
    const prisma = await buildPrisma(false);
    const cache = {};
    const service = makeService(prisma, cache);

    const result = await service.login(tenantSlug, email, password);

    expect(result).toHaveProperty('accessToken');
  });

  it('returns a challenge when TOTP is enabled', async () => {
    const prisma = await buildPrisma(true);
    const setJson = jest.fn().mockResolvedValue(undefined);
    const cache = { setJson };
    const service = makeService(prisma, cache);

    const result = await service.login(tenantSlug, email, password);

    expect(result).not.toHaveProperty('accessToken');
    expect(result).toHaveProperty('challenge');
    expect(setJson).toHaveBeenCalled();
  });

  it('throws 401 for wrong password', async () => {
    const prisma = await buildPrisma(false);
    const service = makeService(prisma, {});

    await expect(service.login(tenantSlug, email, 'wrong')).rejects.toThrow(UnauthorizedException);
  });

  it('throws 401 for unknown tenant', async () => {
    const prisma = {
      findTenantBySlug: jest.fn().mockResolvedValue(null),
      forTenant: jest.fn(),
    };
    const service = makeService(prisma, {});

    await expect(service.login('bad-slug', email, password)).rejects.toThrow(UnauthorizedException);
  });

  it('throws 401 when user is a staff role (not a manager)', async () => {
    const passwordHash = await hash(password, 10);
    const prisma = {
      findTenantBySlug: jest.fn().mockResolvedValue({ id: tenantId }),
      forTenant: jest.fn().mockReturnValue({
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'user-1',
            role: 'CASHIER',
            passwordHash,
            totpEnabled: false,
            isActive: true,
          }),
        },
      }),
    };
    const service = makeService(prisma, {});

    await expect(service.login(tenantSlug, email, password)).rejects.toThrow(UnauthorizedException);
  });
});

describe('AuthService — setup2fa', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-owner';

  it('returns secret, otpAuthUri, and setupChallenge for an OWNER', async () => {
    const prisma = {
      forTenant: jest.fn().mockReturnValue({
        user: {
          findFirst: jest.fn().mockResolvedValue({
            id: userId,
            role: 'OWNER',
            email: 'owner@example.com',
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      }),
    };
    const setJson = jest.fn().mockResolvedValue(undefined);
    const cache = { setJson };
    const service = makeService(prisma, cache);

    const result = await service.setup2fa(userId, tenantId);

    expect(result.secret).toMatch(/^[A-Z2-7]+$/);
    expect(result.otpAuthUri).toContain('otpauth://totp/');
    expect(result.setupChallenge).toBeDefined();
    expect(setJson).toHaveBeenCalledWith(
      expect.stringContaining('totp:challenge:'),
      expect.objectContaining({ type: 'setup', userId, tenantId }),
      expect.any(Number),
    );
  });

  it('throws 403 for a staff-role user', async () => {
    const prisma = {
      forTenant: jest.fn().mockReturnValue({
        user: {
          findFirst: jest.fn().mockResolvedValue({
            id: userId,
            role: 'CASHIER',
            email: 'cashier@example.com',
          }),
        },
      }),
    };
    const service = makeService(prisma, {});

    await expect(service.setup2fa(userId, tenantId)).rejects.toThrow(ForbiddenException);
  });
});

describe('AuthService — verify2fa', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-owner';
  const { secretBase32 } = totpGenerateSecret();

  function encryptForTest(secret: string): string {
    const { createCipheriv, randomBytes } = require('node:crypto');
    const keyBuf = Buffer.from(TEST_ENCRYPTION_KEY, 'hex');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', keyBuf, iv);
    const enc = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
  }

  function genCurrentCode(secret: string): string {
    const { createHmac } = require('node:crypto');
    const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    function b32decode(s: string): Buffer {
      const bytes: number[] = [];
      let bits = 0, v = 0;
      for (const c of s.replace(/=+$/, '')) {
        const idx = BASE32.indexOf(c);
        v = (v << 5) | idx;
        bits += 5;
        if (bits >= 8) { bits -= 8; bytes.push((v >> bits) & 0xff); }
      }
      return Buffer.from(bytes);
    }
    const key = b32decode(secret);
    const step = Math.floor(Date.now() / 1000 / 30);
    const buf = Buffer.allocUnsafe(8);
    buf.writeUInt32BE(Math.floor(step / 0x100000000), 0);
    buf.writeUInt32BE(step >>> 0, 4);
    const hmac = createHmac('sha1', key).update(buf).digest();
    const offset = hmac[19] & 0xf;
    const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset+1] & 0xff) << 16) | ((hmac[offset+2] & 0xff) << 8) | (hmac[offset+3] & 0xff);
    return String(code % 1_000_000).padStart(6, '0');
  }

  it('enables TOTP and returns {totpEnabled: true} for a setup challenge', async () => {
    const challenge = 'setup-challenge-id';
    const totpSecret = encryptForTest(secretBase32);
    const code = genCurrentCode(secretBase32);

    const updateFn = jest.fn().mockResolvedValue({});
    const prisma = {
      forTenant: jest.fn().mockReturnValue({
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: userId, role: 'OWNER', totpSecret, totpEnabled: false }),
          update: updateFn,
        },
      }),
    };
    const cache = {
      getJson: jest.fn().mockResolvedValue({ type: 'setup', userId, tenantId }),
      del: jest.fn().mockResolvedValue(undefined),
      setJson: jest.fn().mockResolvedValue(undefined),
    };
    const service = makeService(prisma, cache);

    const result = await service.verify2fa(challenge, code);

    expect(result).toEqual({ totpEnabled: true });
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: userId }) }),
      expect.any(Object),
    );
  });

  it('returns accessToken for a login challenge after successful TOTP verify', async () => {
    const challenge = 'login-challenge-id';
    const totpSecret = encryptForTest(secretBase32);
    const code = genCurrentCode(secretBase32);

    const prisma = {
      forTenant: jest.fn().mockReturnValue({
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: userId, role: 'OWNER', totpSecret, totpEnabled: true }),
        },
      }),
    };
    const cache = {
      getJson: jest.fn().mockResolvedValue({ type: 'login', userId, tenantId }),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const service = makeService(prisma, cache);

    const result = await service.verify2fa(challenge, code);

    expect(result).toHaveProperty('accessToken');
  });

  it('throws 401 for an expired or missing challenge', async () => {
    const cache = { getJson: jest.fn().mockResolvedValue(null) };
    const service = makeService({}, cache);

    await expect(service.verify2fa('bad-challenge', '123456')).rejects.toThrow(UnauthorizedException);
  });

  it('throws 401 for a wrong TOTP code', async () => {
    const challenge = 'challenge-id';
    const totpSecret = encryptForTest(secretBase32);
    const prisma = {
      forTenant: jest.fn().mockReturnValue({
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: userId, role: 'OWNER', totpSecret, totpEnabled: true }),
        },
      }),
    };
    const cache = {
      getJson: jest.fn().mockResolvedValue({ type: 'login', userId, tenantId }),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const service = makeService(prisma, cache);

    await expect(service.verify2fa(challenge, '000000')).rejects.toThrow(UnauthorizedException);
  });

  it('invalidates the challenge after use so it cannot be reused', async () => {
    const challenge = 'single-use-challenge';
    const del = jest.fn().mockResolvedValue(undefined);
    const totpSecret = encryptForTest(secretBase32);
    const code = genCurrentCode(secretBase32);

    const prisma = {
      forTenant: jest.fn().mockReturnValue({
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: userId, role: 'OWNER', totpSecret, totpEnabled: false }),
          update: jest.fn().mockResolvedValue({}),
        },
      }),
    };
    const cache = {
      getJson: jest.fn().mockResolvedValue({ type: 'setup', userId, tenantId }),
      del,
    };
    const service = makeService(prisma, cache);

    await service.verify2fa(challenge, code);

    expect(del).toHaveBeenCalledWith(`totp:challenge:${challenge}`);
  });
});
