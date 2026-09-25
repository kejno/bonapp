import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { hash } from 'bcryptjs';
import { createCipheriv, createHmac, randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CacheService } from '../src/cache/cache.service';
import {
  totpGenerateSecret,
  totpVerify,
} from '../src/auth/auth.service';

const TEST_JWT_SECRET = 'bnp132-e2e-secret';
const TEST_TOTP_KEY = 'ab'.repeat(32); // 64 hex chars = 32 bytes

process.env.JWT_SECRET ??= TEST_JWT_SECRET;
process.env.TOTP_ENCRYPTION_KEY ??= TEST_TOTP_KEY;

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
  const sig = createHmac('sha256', process.env.JWT_SECRET!)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

function genTotpCode(secretBase32: string): string {
  const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes: number[] = [];
  let bits = 0, v = 0;
  for (const c of secretBase32.replace(/=+$/, '')) {
    const idx = BASE32.indexOf(c);
    v = (v << 5) | idx;
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((v >> bits) & 0xff); }
  }
  const key = Buffer.from(bytes);
  const step = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.allocUnsafe(8);
  buf.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  buf.writeUInt32BE(step >>> 0, 4);
  const digest = createHmac('sha1', key).update(buf).digest();
  const offset = digest[19] & 0xf;
  const code = ((digest[offset] & 0x7f) << 24) | ((digest[offset+1] & 0xff) << 16) | ((digest[offset+2] & 0xff) << 8) | (digest[offset+3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

const TENANT_ID = 'tenant-bnp132';
const TENANT_SLUG = 'bnp132-cafe';
const OWNER_ID = 'owner-bnp132';
const CASHIER_ID = 'cashier-bnp132';
const CASHIER_PIN = '7392';

function isAccessTokenResponse(value: unknown): value is { accessToken: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'accessToken' in value &&
    typeof value.accessToken === 'string'
  );
}

function isTotpSetupResponse(
  value: unknown,
): value is { secret: string; otpAuthUri: string; setupChallenge: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'secret' in value &&
    typeof value.secret === 'string' &&
    'otpAuthUri' in value &&
    typeof value.otpAuthUri === 'string' &&
    'setupChallenge' in value &&
    typeof value.setupChallenge === 'string'
  );
}

describe('BNP-132: PIN-login and 2FA TOTP flows', () => {
  let app: INestApplication<App>;
  let cacheStore: Map<string, unknown>;

  beforeEach(async () => {
    cacheStore = new Map();

    const cashierPinHash = await hash(CASHIER_PIN, 10);

    const mockPrisma: Partial<PrismaService> = {
      findTenantBySlug: jest.fn().mockImplementation((slug: string) => {
        if (slug === TENANT_SLUG) return Promise.resolve({ id: TENANT_ID, slug });
        return Promise.resolve(null);
      }),
      forTenant: jest.fn().mockReturnValue({
        user: {
          findMany: jest.fn().mockResolvedValue([
            { id: CASHIER_ID, role: 'CASHIER', pinHash: cashierPinHash, isBlocked: false },
          ]),
          findFirst: jest.fn().mockResolvedValue({
            id: OWNER_ID,
            role: 'OWNER',
            email: 'owner@bnp132.com',
            passwordHash: await hash('secret123', 10),
            totpSecret: null,
            totpEnabled: false,
            isActive: true,
            isBlocked: false,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      }),
    };

    const mockCache: Partial<CacheService> = {
      increment: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockImplementation((key: string) => {
        cacheStore.delete(key);
        return Promise.resolve();
      }),
      getJson: jest.fn().mockImplementation(<T>(key: string) =>
        Promise.resolve((cacheStore.get(key) as T) ?? null),
      ),
      consumeJson: jest.fn().mockImplementation(<T>(key: string) => {
        const value = cacheStore.get(key) as T | undefined;
        cacheStore.delete(key);
        return Promise.resolve(value ?? null);
      }),
      setJson: jest.fn().mockImplementation((key: string, value: unknown) => {
        cacheStore.set(key, value);
        return Promise.resolve();
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(CacheService)
      .useValue(mockCache)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('PIN-login: POST /api/v1/auth/pin-login', () => {
    it('returns JWT for correct PIN', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/pin-login')
        .send({ tenantSlug: TENANT_SLUG, pin: CASHIER_PIN })
        .expect(201);

      const responseBody: unknown = response.body;
      expect(isAccessTokenResponse(responseBody)).toBe(true);
      if (!isAccessTokenResponse(responseBody)) return;
      expect(responseBody.accessToken).toMatch(/^[^.]+\.[^.]+\.[^.]+$/);
    });

    it('returns 401 for wrong PIN', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/pin-login')
        .send({ tenantSlug: TENANT_SLUG, pin: '0000' })
        .expect(401);
    });

    it('returns 401 for unknown tenant', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/pin-login')
        .send({ tenantSlug: 'unknown-slug', pin: CASHIER_PIN })
        .expect(401);
    });

    it('returns 400 when pin is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/pin-login')
        .send({ tenantSlug: TENANT_SLUG })
        .expect(400);
    });

    it('returns 429 when rate limit is exceeded', async () => {
      jest.spyOn(app.get(CacheService), 'increment').mockResolvedValue(6);

      await request(app.getHttpServer())
        .post('/api/v1/auth/pin-login')
        .send({ tenantSlug: TENANT_SLUG, pin: '0000' })
        .expect('Retry-After', '900')
        .expect(429);
    });
  });

  describe('TOTP setup → verify → login requires 2FA', () => {
    it('2FA setup returns secret, otpAuthUri, and setupChallenge for authenticated OWNER', async () => {
      const token = makeJwt({ tenantId: TENANT_ID, userId: OWNER_ID, role: 'OWNER' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/setup')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const responseBody: unknown = response.body;
      expect(isTotpSetupResponse(responseBody)).toBe(true);
      if (!isTotpSetupResponse(responseBody)) return;
      expect(responseBody.secret).toMatch(/^[A-Z2-7]+$/);
      expect(responseBody.otpAuthUri).toContain('otpauth://totp/');
    });

    it('2FA setup → verify (setup challenge) → returns {totpEnabled: true}', async () => {
      const { secretBase32 } = totpGenerateSecret();

      const keyBuf = Buffer.from(process.env.TOTP_ENCRYPTION_KEY!, 'hex');
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', keyBuf, iv);
      const enc = Buffer.concat([cipher.update(secretBase32, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      const encryptedSecret = `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;

      const challengeId = 'setup-challenge-bnp132';
      cacheStore.set(`totp:challenge:${challengeId}`, {
        type: 'setup',
        userId: OWNER_ID,
        tenantId: TENANT_ID,
      });

      const mockPrismaForVerify = app.get(PrismaService);
      (mockPrismaForVerify.forTenant as jest.Mock).mockReturnValue({
        user: {
          findFirst: jest.fn().mockResolvedValue({
            id: OWNER_ID,
            role: 'OWNER',
            totpSecret: encryptedSecret,
            totpEnabled: false,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      });

      const code = genTotpCode(secretBase32);
      const isValid = totpVerify(secretBase32, code);
      if (!isValid) {
        throw new Error('Generated TOTP code is invalid — timing issue in test');
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/verify')
        .send({ challenge: challengeId, code })
        .expect(201);

      expect(response.body).toEqual({ totpEnabled: true });
    });

    it('2FA verify returns JWT for login challenge', async () => {
      const { secretBase32 } = totpGenerateSecret();

      const keyBuf = Buffer.from(process.env.TOTP_ENCRYPTION_KEY!, 'hex');
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', keyBuf, iv);
      const enc = Buffer.concat([cipher.update(secretBase32, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      const encryptedSecret = `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;

      const challengeId = 'login-challenge-bnp132';
      cacheStore.set(`totp:challenge:${challengeId}`, {
        type: 'login',
        userId: OWNER_ID,
        tenantId: TENANT_ID,
      });

      const mockPrismaForVerify = app.get(PrismaService);
      (mockPrismaForVerify.forTenant as jest.Mock).mockReturnValue({
        user: {
          findFirst: jest.fn().mockResolvedValue({
            id: OWNER_ID,
            role: 'OWNER',
            totpSecret: encryptedSecret,
            totpEnabled: true,
          }),
        },
      });

      const code = genTotpCode(secretBase32);
      const isValid = totpVerify(secretBase32, code);
      if (!isValid) {
        throw new Error('Generated TOTP code is invalid — timing issue in test');
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/verify')
        .send({ challenge: challengeId, code })
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
    });

    it('2FA verify returns 401 for expired or missing challenge', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/verify')
        .send({ challenge: 'nonexistent-challenge', code: '000000' })
        .expect(401);
    });

    it('2FA setup returns 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/setup')
        .expect(401);
    });
  });
});
