import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { PrismaService } from '../prisma/prisma.service';

// Mock ESM packages before any imports that would trigger their loading
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));
jest.mock('otplib', () => ({
  authenticator: {
    generateSecret: jest.fn(),
    keyuri: jest.fn(),
    check: jest.fn(),
  },
}));
jest.mock('qrcode', () => ({ toDataURL: jest.fn() }));

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcrypt');
const PIN_1234_HASH: string = bcrypt.hashSync('1234', 10);

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';
const TENANT_SLUG = 'resto';
const TEST_IP = '127.0.0.1';
const TOTP_KEY = crypto.randomBytes(32).toString('hex');

function encryptSecret(plainSecret: string): string {
  const key = Buffer.from(TOTP_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plainSecret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':');
}

const mockPrisma = {
  tenant: { findUnique: jest.fn() },
  user: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('signed-token'),
  verify: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string, def?: string) => (key === 'JWT_EXPIRATION' ? '15m' : def)),
  getOrThrow: jest.fn((key: string) => {
    if (key === 'TOTP_ENCRYPTION_KEY') return TOTP_KEY;
    throw new Error(`Missing: ${key}`);
  }),
};

const mockRedis = {
  get: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  setex: jest.fn(),
  ttl: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('pinLogin', () => {
    beforeEach(() => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: USER_ID, role: 'CASHIER', pinHash: PIN_1234_HASH, tenantId: TENANT_ID },
      ]);
    });

    it('should return access_token for valid PIN', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, slug: TENANT_SLUG });
      mockRedis.get.mockResolvedValue(null);
      mockRedis.del.mockResolvedValue(1);

      const result = await service.pinLogin({ pin: '1234', tenantSlug: TENANT_SLUG }, TEST_IP);

      expect(result).toEqual({ access_token: 'signed-token' });
      expect(mockRedis.del).toHaveBeenCalledWith(`pin:rl:${TENANT_ID}:${TEST_IP}`);
    });

    it('should throw UnauthorizedException for invalid PIN', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, slug: TENANT_SLUG });
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);

      await expect(
        service.pinLogin({ pin: '0000', tenantSlug: TENANT_SLUG }, TEST_IP),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.pinLogin({ pin: '1234', tenantSlug: 'unknown' }, TEST_IP),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw 429 after 5 failed attempts', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, slug: TENANT_SLUG });
      mockRedis.get.mockResolvedValue('5');
      mockRedis.ttl.mockResolvedValue(600);

      await expect(
        service.pinLogin({ pin: '1234', tenantSlug: TENANT_SLUG }, TEST_IP),
      ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    });

    it('should reset rate limit counter on successful login', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, slug: TENANT_SLUG });
      mockRedis.get.mockResolvedValue('3');
      mockRedis.del.mockResolvedValue(1);

      await service.pinLogin({ pin: '1234', tenantSlug: TENANT_SLUG }, TEST_IP);

      expect(mockRedis.del).toHaveBeenCalledWith(`pin:rl:${TENANT_ID}:${TEST_IP}`);
    });

    it('should check all users in the tenant before failing', async () => {
      const hash1 = bcrypt.hashSync('9999', 10);
      const hash2 = bcrypt.hashSync('8888', 10);
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, slug: TENANT_SLUG });
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u1', role: 'CASHIER', pinHash: hash1 },
        { id: 'u2', role: 'CHEF', pinHash: hash2 },
      ]);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);

      await expect(
        service.pinLogin({ pin: '0000', tenantSlug: TENANT_SLUG }, TEST_IP),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.user.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('login', () => {
    const passwordHash = bcrypt.hashSync('secret', 10);

    it('should return access_token for valid credentials without 2FA', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, slug: TENANT_SLUG });
      mockPrisma.user.findFirst.mockResolvedValue({
        id: USER_ID,
        role: 'MANAGER',
        passwordHash,
        totpEnabled: false,
      });

      const result = await service.login({
        email: 'mgr@example.com',
        password: 'secret',
        tenantSlug: TENANT_SLUG,
      });

      expect(result).toEqual({ access_token: 'signed-token' });
    });

    it('should return challenge when 2FA is enabled', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, slug: TENANT_SLUG });
      mockPrisma.user.findFirst.mockResolvedValue({
        id: USER_ID,
        role: 'OWNER',
        passwordHash,
        totpEnabled: true,
      });
      mockRedis.setex.mockResolvedValue('OK');

      const result = await service.login({
        email: 'owner@example.com',
        password: 'secret',
        tenantSlug: TENANT_SLUG,
      });

      expect(result).toMatchObject({ requires_2fa: true, challenge: 'signed-token' });
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, slug: TENANT_SLUG });
      mockPrisma.user.findFirst.mockResolvedValue({
        id: USER_ID,
        role: 'MANAGER',
        passwordHash,
        totpEnabled: false,
      });

      await expect(
        service.login({ email: 'mgr@example.com', password: 'wrong', tenantSlug: TENANT_SLUG }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'x@x.com', password: 'pw', tenantSlug: 'bad' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user has no password hash', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, slug: TENANT_SLUG });
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login({ email: 'cashier@x.com', password: 'pw', tenantSlug: TENANT_SLUG }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('setup2fa', () => {
    beforeEach(() => {
      (authenticator.generateSecret as jest.Mock).mockReturnValue('JBSWY3DPEHPK3PXP');
      (authenticator.keyuri as jest.Mock).mockReturnValue('otpauth://totp/Bonapp:owner@x.com?secret=JBSWY3DPEHPK3PXP');
      (qrcode.toDataURL as jest.Mock).mockResolvedValue('data:image/png;base64,mock==');
    });

    it('should generate provisioning URI and QR code', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: USER_ID, role: 'OWNER', email: 'owner@x.com' });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.setup2fa(USER_ID);

      expect(result.provisioning_uri).toContain('otpauth://totp/');
      expect(result.qr_code).toBe('data:image/png;base64,mock==');
    });

    it('should store encrypted TOTP secret (not plaintext)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: USER_ID, role: 'MANAGER', email: 'mgr@x.com' });

      let storedSecret: string | undefined;
      mockPrisma.user.update.mockImplementation(({ data }: { data: { totpSecret: string } }) => {
        storedSecret = data.totpSecret;
        return Promise.resolve({});
      });

      await service.setup2fa(USER_ID);

      expect(storedSecret).toBeDefined();
      // Encrypted format: iv:tag:ciphertext (all hex)
      expect(storedSecret).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
      // Must not contain the plaintext secret
      expect(storedSecret).not.toContain('JBSWY3DPEHPK3PXP');
    });

    it('should set totpEnabled=false after setup', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: USER_ID, role: 'OWNER', email: 'owner@x.com' });
      mockPrisma.user.update.mockResolvedValue({});

      await service.setup2fa(USER_ID);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ totpEnabled: false }) }),
      );
    });

    it('should throw UnauthorizedException for non-OWNER/MANAGER user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: USER_ID, role: 'CASHIER', email: 'c@x.com' });

      await expect(service.setup2fa(USER_ID)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.setup2fa('nonexistent')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('verify2fa — setup confirmation', () => {
    it('should set totpEnabled=true on valid TOTP code', async () => {
      const stored = encryptSecret('JBSWY3DPEHPK3PXP');
      (authenticator.check as jest.Mock).mockReturnValue(true);
      mockPrisma.user.findUnique.mockResolvedValue({ id: USER_ID, role: 'OWNER', totpSecret: stored });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.verify2fa({ code: '123456' }, USER_ID);

      expect(result).toEqual({ success: true });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { totpEnabled: true },
      });
      expect(authenticator.check).toHaveBeenCalledWith('123456', 'JBSWY3DPEHPK3PXP');
    });

    it('should throw UnauthorizedException for invalid TOTP code during setup', async () => {
      const stored = encryptSecret('JBSWY3DPEHPK3PXP');
      (authenticator.check as jest.Mock).mockReturnValue(false);
      mockPrisma.user.findUnique.mockResolvedValue({ id: USER_ID, role: 'OWNER', totpSecret: stored });

      await expect(service.verify2fa({ code: '000000' }, USER_ID)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw when TOTP secret is not configured', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: USER_ID, role: 'OWNER', totpSecret: null });

      await expect(service.verify2fa({ code: '123456' }, USER_ID)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('verify2fa — challenge login', () => {
    const JTI = 'test-jti';

    it('should return access_token for valid challenge and TOTP code', async () => {
      const stored = encryptSecret('JBSWY3DPEHPK3PXP');
      (authenticator.check as jest.Mock).mockReturnValue(true);
      mockJwt.verify.mockReturnValue({ sub: USER_ID, tenantId: TENANT_ID, type: '2fa_challenge', jti: JTI });
      mockRedis.exists.mockResolvedValue(1);
      mockPrisma.user.findUnique.mockResolvedValue({ id: USER_ID, role: 'OWNER', totpSecret: stored });
      mockRedis.del.mockResolvedValue(1);

      const result = await service.verify2fa({ code: '123456', challenge: 'ch-tok' });

      expect(result).toEqual({ access_token: 'signed-token' });
      expect(mockRedis.del).toHaveBeenCalledWith(`challenge:${JTI}`);
    });

    it('should throw when challenge token is invalid', async () => {
      mockJwt.verify.mockImplementation(() => { throw new Error('invalid token'); });

      await expect(
        service.verify2fa({ code: '123456', challenge: 'bad-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when challenge has already been used', async () => {
      mockJwt.verify.mockReturnValue({ sub: USER_ID, tenantId: TENANT_ID, type: '2fa_challenge', jti: 'used-jti' });
      mockRedis.exists.mockResolvedValue(0);

      await expect(
        service.verify2fa({ code: '123456', challenge: 'used-challenge' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when challenge type is not 2fa_challenge', async () => {
      mockJwt.verify.mockReturnValue({ sub: USER_ID, tenantId: TENANT_ID, type: 'access', jti: 'some-jti' });
      mockRedis.exists.mockResolvedValue(1);

      await expect(
        service.verify2fa({ code: '123456', challenge: 'wrong-type' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw for invalid TOTP code during challenge login', async () => {
      const stored = encryptSecret('JBSWY3DPEHPK3PXP');
      (authenticator.check as jest.Mock).mockReturnValue(false);
      mockJwt.verify.mockReturnValue({ sub: USER_ID, tenantId: TENANT_ID, type: '2fa_challenge', jti: JTI });
      mockRedis.exists.mockResolvedValue(1);
      mockPrisma.user.findUnique.mockResolvedValue({ id: USER_ID, role: 'OWNER', totpSecret: stored });

      await expect(
        service.verify2fa({ code: '000000', challenge: 'ch-tok' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
