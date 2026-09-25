import { ForbiddenException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcryptjs';
import { createCipheriv, createHmac, randomBytes } from 'node:crypto';
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
    const cache = { del: jest.fn().mockResolvedValue(undefined) };
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

  it('upgrades an existing plaintext PIN to bcrypt after successful login', async () => {
    const update = jest.fn<Promise<unknown>, [{ where: { id: string }; data: { pinHash: string } }]>().mockResolvedValue({});
    const prisma = {
      findTenantBySlug: jest.fn().mockResolvedValue({ id: tenantId, slug: tenantSlug }),
      forTenant: jest.fn().mockReturnValue({
        user: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'legacy-user', role: 'CASHIER', pinHash: pin, isBlocked: false },
          ]),
          update,
        },
      }),
    };
    const service = makeService(prisma, { increment: jest.fn().mockResolvedValue(1), del: jest.fn().mockResolvedValue(undefined) });

    await expect(service.pinLogin(tenantSlug, pin)).resolves.toHaveProperty('accessToken');

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].where).toEqual({ id: 'legacy-user' });
    expect(update.mock.calls[0][0].data.pinHash).toMatch(/^\$2[aby]\$/);
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

  it('returns 429 with Retry-After after too many failed PIN attempts', async () => {
    const prisma = {
      findTenantBySlug: jest.fn().mockResolvedValue({ id: tenantId }),
      forTenant: jest.fn().mockReturnValue({
        user: { findMany: jest.fn().mockResolvedValue([]) },
      }),
    };
    const cache = { increment: jest.fn().mockResolvedValue(6) };
    const service = makeService(prisma, cache);

    await expect(service.pinLogin(tenantSlug, pin, '1.2.3.4')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('rejects a correct PIN before checking it when the IP is rate limited', async () => {
    const prisma = await buildPrisma();
    const cache = {
      increment: jest.fn().mockResolvedValue(6),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const service = makeService(prisma, cache);

    await expect(service.pinLogin(tenantSlug, pin, '1.2.3.4')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
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

  it('rejects an ambiguous PIN shared by multiple staff users', async () => {
    const sharedHash1 = await hash(pin, 10);
    const sharedHash2 = await hash(pin, 10);
    const prisma = {
      findTenantBySlug: jest.fn().mockResolvedValue({ id: tenantId }),
      forTenant: jest.fn().mockReturnValue({
        user: { findMany: jest.fn().mockResolvedValue([
          { id: 'user-1', role: 'CASHIER', pinHash: sharedHash1, isBlocked: false },
          { id: 'user-2', role: 'WAITER', pinHash: sharedHash2, isBlocked: false },
        ]) },
      }),
    };
    const service = makeService(prisma, { increment: jest.fn().mockResolvedValue(1), del: jest.fn().mockResolvedValue(undefined) });

    await expect(service.pinLogin(tenantSlug, pin, '127.0.0.1')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects PIN login for a blocked staff account', async () => {
    const pinHash = await hash(pin, 10);
    const prisma = {
      findTenantBySlug: jest.fn().mockResolvedValue({ id: tenantId }),
      forTenant: jest.fn().mockReturnValue({ user: { findMany: jest.fn().mockResolvedValue([
        { id: 'blocked', role: 'CASHIER', pinHash, isBlocked: true },
      ]) } }),
    };
    const service = makeService(prisma, { increment: jest.fn().mockResolvedValue(1) });
    await expect(service.pinLogin(tenantSlug, pin)).rejects.toThrow(UnauthorizedException);
  });
});

describe('AuthService — login', () => {
  const tenantSlug = 'my-restaurant';
  const tenantId = 'tenant-1';
  const email = 'owner@example.com';
  const password = 'secret123';

  async function buildPrisma(totpEnabled = false, isBlocked = false) {
    const passwordHash = await hash(password, 10);
    return {
      findTenantBySlug: jest.fn().mockResolvedValue({ id: tenantId }),
      forTenant: jest.fn().mockReturnValue({
        user: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'user-owner',
            role: 'OWNER',
            passwordHash,
            totpEnabled,
            isActive: true,
            isBlocked,
          }),
        },
      }),
    };
  }

  it('returns a JWT for valid credentials when TOTP is not enabled', async () => {
    const prisma = await buildPrisma(false);
    const cache = { increment: jest.fn().mockResolvedValue(1), del: jest.fn().mockResolvedValue(undefined) };
    const service = makeService(prisma, cache);

    const result = await service.login(tenantSlug, email, password);

    expect(result).toHaveProperty('accessToken');
  });

  it('returns a challenge when TOTP is enabled', async () => {
    const prisma = await buildPrisma(true);
    const setJsonRequired = jest.fn().mockResolvedValue(undefined);
    const cache = { increment: jest.fn().mockResolvedValue(1), setJsonRequired, getJson: jest.fn().mockResolvedValue(null), del: jest.fn().mockResolvedValue(undefined) };
    const service = makeService(prisma, cache);

    const result = await service.login(tenantSlug, email, password);

    expect(result).not.toHaveProperty('accessToken');
    expect(result).toHaveProperty('challenge');
    expect(setJsonRequired).toHaveBeenCalled();
  });

  it('throws 401 for wrong password', async () => {
    const prisma = await buildPrisma(false);
    const cache = { increment: jest.fn().mockResolvedValue(1) };
    const service = makeService(prisma, cache);

    await expect(service.login(tenantSlug, email, 'wrong')).rejects.toThrow(UnauthorizedException);
  });

  it('forbids password login for a blocked manager', async () => {
    const prisma = await buildPrisma(false, true);
    const service = makeService(prisma, { increment: jest.fn().mockResolvedValue(1) });
    await expect(service.login(tenantSlug, email, password)).rejects.toThrow(ForbiddenException);
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
          findFirst: jest.fn().mockResolvedValue({
            id: 'user-1',
            role: 'CASHIER',
            passwordHash,
            totpEnabled: false,
            isActive: true,
          }),
        },
      }),
    };
    const cache = { increment: jest.fn().mockResolvedValue(1) };
    const service = makeService(prisma, cache);

    await expect(service.login(tenantSlug, email, password)).rejects.toThrow(UnauthorizedException);
  });

  it('returns 429 with Retry-After after too many failed password attempts', async () => {
    const prisma = await buildPrisma(false);
    const cache = { increment: jest.fn().mockResolvedValue(6) };
    const service = makeService(prisma, cache);

    await expect(service.login(tenantSlug, email, 'wrong', '127.0.0.1')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(cache.increment).toHaveBeenCalledWith(
      `login:attempts:${tenantId}:127.0.0.1`,
      900,
    );
  });

  it('rejects a correct password before comparing it when the IP is rate limited', async () => {
    const prisma = await buildPrisma(false);
    const cache = { increment: jest.fn().mockResolvedValue(6) };
    const service = makeService(prisma, cache);

    await expect(service.login(tenantSlug, email, password, '127.0.0.1')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('blocks challenge issuance when TOTP fail count exceeds limit', async () => {
    const prisma = await buildPrisma(true);
    const cache = { increment: jest.fn().mockResolvedValue(1), getJson: jest.fn().mockResolvedValue(6), del: jest.fn().mockResolvedValue(undefined) };
    const service = makeService(prisma, cache);

    await expect(service.login(tenantSlug, email, password)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
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
    const setJsonRequired = jest.fn().mockResolvedValue(undefined);
    const cache = { setJsonRequired };
    const service = makeService(prisma, cache);

    const result = await service.setup2fa(userId, tenantId);

    expect(result.secret).toMatch(/^[A-Z2-7]+$/);
    expect(result.otpAuthUri).toContain('otpauth://totp/');
    expect(result.setupChallenge).toBeDefined();
    expect(setJsonRequired).toHaveBeenCalledWith(
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

  it('does not replace an already enabled TOTP secret', async () => {
    const update = jest.fn();
    const prisma = { forTenant: jest.fn().mockReturnValue({ user: {
      findFirst: jest.fn().mockResolvedValue({ id: userId, role: 'OWNER', email: 'owner@example.com', totpEnabled: true }),
      update,
    } }) };
    const service = makeService(prisma, {});
    await expect(service.setup2fa(userId, tenantId)).rejects.toThrow(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('AuthService — verify2fa', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-owner';
  const { secretBase32 } = totpGenerateSecret();

  function encryptForTest(secret: string): string {
    const keyBuf = Buffer.from(TEST_ENCRYPTION_KEY, 'hex');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', keyBuf, iv);
    const enc = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
  }

  function genCurrentCode(secret: string): string {
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

    const updateFn = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
    const prisma = {
      forTenant: jest.fn().mockReturnValue({
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: userId, role: 'OWNER', totpSecret, totpEnabled: false, isActive: true }),
          update: updateFn,
        },
      }),
    };
    const cache = {
      consumeJson: jest.fn().mockResolvedValue({ type: 'setup', userId, tenantId }),
      setJsonIfAbsent: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const service = makeService(prisma, cache);

    const result = await service.verify2fa(challenge, code);

    expect(result).toEqual({ totpEnabled: true });
    expect(updateFn).toHaveBeenCalledTimes(1);
  });

  it('returns accessToken for a login challenge after successful TOTP verify', async () => {
    const challenge = 'login-challenge-id';
    const totpSecret = encryptForTest(secretBase32);
    const code = genCurrentCode(secretBase32);

    const prisma = {
      forTenant: jest.fn().mockReturnValue({
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: userId, role: 'OWNER', totpSecret, totpEnabled: true, isActive: true }),
        },
      }),
    };
    const cache = {
      consumeJson: jest.fn().mockResolvedValue({ type: 'login', userId, tenantId }),
      setJsonIfAbsent: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const service = makeService(prisma, cache);

    const result = await service.verify2fa(challenge, code);

    expect(result).toHaveProperty('accessToken');
  });

  it('throws 401 for an expired or missing challenge', async () => {
    const cache = { consumeJson: jest.fn().mockResolvedValue(null) };
    const service = makeService({}, cache);

    await expect(service.verify2fa('bad-challenge', '123456')).rejects.toThrow(UnauthorizedException);
  });

  it('throws 401 for a wrong TOTP code', async () => {
    const challenge = 'challenge-id';
    const totpSecret = encryptForTest(secretBase32);
    const prisma = {
      forTenant: jest.fn().mockReturnValue({
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: userId, role: 'OWNER', totpSecret, totpEnabled: true, isActive: true }),
        },
      }),
    };
    const cache = {
      consumeJson: jest.fn().mockResolvedValue({ type: 'login', userId, tenantId }),
      increment: jest.fn().mockResolvedValue(1),
    };
    const service = makeService(prisma, cache);

    await expect(service.verify2fa(challenge, '000000')).rejects.toThrow(UnauthorizedException);
  });

  it('consumes the challenge atomically so concurrent verifies allow only one', async () => {
    const challenge = 'single-use-challenge';
    let consumed = false;
    const consumeJson = jest.fn().mockImplementation(() => {
      if (consumed) return null;
      consumed = true;
      return { type: 'setup', userId, tenantId };
    });
    const totpSecret = encryptForTest(secretBase32);
    const code = genCurrentCode(secretBase32);

    const prisma = {
      forTenant: jest.fn().mockReturnValue({
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: userId, role: 'OWNER', totpSecret, totpEnabled: false, isActive: true }),
          update: jest.fn().mockResolvedValue({}),
        },
      }),
    };
    const cache = {
      consumeJson,
      setJsonIfAbsent: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const service = makeService(prisma, cache);

    const results = await Promise.allSettled([
      service.verify2fa(challenge, code),
      service.verify2fa(challenge, code),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('rejects 2FA verification for a blocked manager', async () => {
    const challenge = 'blocked-user-challenge';
    const totpSecret = encryptForTest(secretBase32);
    const prisma = { forTenant: jest.fn().mockReturnValue({ user: { findFirst: jest.fn().mockResolvedValue({
      id: userId, role: 'OWNER', totpSecret, totpEnabled: true, isBlocked: true,
    }) } }) };
    const cache = { consumeJson: jest.fn().mockResolvedValue({ type: 'login', userId, tenantId }) };
    const service = makeService(prisma, cache);
    await expect(service.verify2fa(challenge, genCurrentCode(secretBase32))).rejects.toThrow(ForbiddenException);
  });

  it('rejects a replayed TOTP code and increments fail counter', async () => {
    const challenge = 'replay-challenge';
    const totpSecret = encryptForTest(secretBase32);
    const code = genCurrentCode(secretBase32);

    const prisma = {
      forTenant: jest.fn().mockReturnValue({
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: userId, role: 'OWNER', totpSecret, totpEnabled: true, isActive: true }),
        },
      }),
    };
    const increment = jest.fn().mockResolvedValue(1);
    const cache = {
      consumeJson: jest.fn().mockResolvedValue({ type: 'login', userId, tenantId }),
      setJsonIfAbsent: jest.fn().mockResolvedValue(false), // counter already marked as used
      increment,
    };
    const service = makeService(prisma, cache);

    await expect(service.verify2fa(challenge, code)).rejects.toThrow(UnauthorizedException);
    expect(increment).toHaveBeenCalledWith(
      `totp:fails:${userId}`,
      expect.any(Number),
    );
  });

  it('returns 429 when TOTP fail attempts exceed the limit', async () => {
    const challenge = 'rl-challenge';
    const totpSecret = encryptForTest(secretBase32);

    const prisma = {
      forTenant: jest.fn().mockReturnValue({
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: userId, role: 'OWNER', totpSecret, totpEnabled: true, isActive: true }),
        },
      }),
    };
    const cache = {
      consumeJson: jest.fn().mockResolvedValue({ type: 'login', userId, tenantId }),
      increment: jest.fn().mockResolvedValue(6), // 6 > TOTP_FAIL_LIMIT (5) → throws 429
    };
    const service = makeService(prisma, cache);

    await expect(service.verify2fa(challenge, '000000')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('clears TOTP fail counter after successful verification', async () => {
    const challenge = 'success-clears-fails';
    const totpSecret = encryptForTest(secretBase32);
    const code = genCurrentCode(secretBase32);

    const prisma = {
      forTenant: jest.fn().mockReturnValue({
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: userId, role: 'OWNER', totpSecret, totpEnabled: true, isActive: true }),
        },
      }),
    };
    const del = jest.fn().mockResolvedValue(undefined);
    const cache = {
      consumeJson: jest.fn().mockResolvedValue({ type: 'login', userId, tenantId }),
      setJsonIfAbsent: jest.fn().mockResolvedValue(true),
      del,
    };
    const service = makeService(prisma, cache);

    await service.verify2fa(challenge, code);

    expect(del).toHaveBeenCalledWith(`totp:fails:${userId}`);
  });

  it('allows only one concurrent verify for the same TOTP counter across different challenges', async () => {
    const totpSecret = encryptForTest(secretBase32);
    const code = genCurrentCode(secretBase32);
    const prisma = { forTenant: jest.fn().mockReturnValue({ user: { findFirst: jest.fn().mockResolvedValue({
      id: userId, role: 'OWNER', totpSecret, totpEnabled: true, isBlocked: false, isActive: true,
    }) } }) };
    let used = false;
    const cache = {
      consumeJson: jest.fn().mockImplementation((key: string) => Promise.resolve({ type: 'login', userId, tenantId, key })),
      setJsonIfAbsent: jest.fn().mockImplementation(() => {
        if (used) return false;
        used = true;
        return Promise.resolve(true);
      }),
      del: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(1),
    };
    const service = makeService(prisma, cache);
    const results = await Promise.allSettled([
      service.verify2fa('challenge-1', code),
      service.verify2fa('challenge-2', code),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(cache.setJsonIfAbsent).toHaveBeenCalledTimes(2);
  });

  it('rejects a login challenge for a deactivated user', async () => {
    const totpSecret = encryptForTest(secretBase32);
    const prisma = { forTenant: jest.fn().mockReturnValue({ user: { findFirst: jest.fn().mockResolvedValue({
      id: userId, role: 'OWNER', totpSecret, totpEnabled: true, isBlocked: false, isActive: false,
    }) } }) };
    const service = makeService(prisma, { consumeJson: jest.fn().mockResolvedValue({ type: 'login', userId, tenantId }) });
    await expect(service.verify2fa('inactive-challenge', genCurrentCode(secretBase32))).rejects.toThrow(UnauthorizedException);
  });
});
