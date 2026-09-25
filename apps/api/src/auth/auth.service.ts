import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';

const STAFF_ROLES = new Set(['CASHIER', 'WAITER', 'CHEF']);
const MANAGER_ROLES = new Set(['OWNER', 'MANAGER']);
const BCRYPT_COST = 10;
const PIN_ATTEMPTS_LIMIT = 5;
const PIN_WINDOW_SECONDS = 900; // 15 minutes
const LOGIN_ATTEMPTS_LIMIT = 5;
const LOGIN_WINDOW_SECONDS = 900; // 15 minutes
const PIN_JWT_TTL_SECONDS = 28800; // 8 hours
const MANAGER_JWT_TTL_SECONDS = 86400; // 24 hours
const REFRESH_JWT_TTL_SECONDS = 604800; // 7 days
const LOGIN_CHALLENGE_TTL_SECONDS = 180; // 3 minutes
const SETUP_CHALLENGE_TTL_SECONDS = 300; // 5 minutes
const TOTP_STEP_SECONDS = 30;
const TOTP_WINDOW = 1;
const TOTP_FAIL_LIMIT = 5;
const TOTP_FAIL_WINDOW_SECONDS = 300; // 5 minutes

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let result = '';
  let bits = 0;
  let value = 0;
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_CHARS[(value >> bits) & 0x1f];
    }
  }
  if (bits > 0) result += BASE32_CHARS[(value << (5 - bits)) & 0x1f];
  return result;
}

function base32Decode(base32: string): Buffer {
  const normalized = base32.toUpperCase().replace(/=+$/, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of normalized) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base32 char: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function hotpCode(key: Buffer, counter: number): string {
  const counterBuf = Buffer.allocUnsafe(8);
  const hi = Math.floor(counter / 0x100000000);
  const lo = counter >>> 0;
  counterBuf.writeUInt32BE(hi, 0);
  counterBuf.writeUInt32BE(lo, 4);
  const hmac = createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[19] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

function totpVerifyGetCounter(secretBase32: string, code: string): number | null {
  const key = base32Decode(secretBase32);
  const step = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
  for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++) {
    if (hotpCode(key, step + i) === code) return step + i;
  }
  return null;
}

export function totpVerify(secretBase32: string, code: string): boolean {
  return totpVerifyGetCounter(secretBase32, code) !== null;
}

export function totpGenerateSecret(): { secretBase32: string } {
  const secretBase32 = base32Encode(randomBytes(20));
  return { secretBase32 };
}

export function buildOtpAuthUri(
  secretBase32: string,
  email: string,
  issuer: string,
): string {
  const account = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${account}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

function encryptTotpSecret(secret: string, keyBuf: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBuf, iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptTotpSecret(stored: string, keyBuf: Buffer): string {
  const parts = stored.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted TOTP format');
  const [ivHex, tagHex, dataHex] = parts;
  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyBuf,
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

function createJwt(
  payload: Record<string, unknown>,
  secret: string,
  ttlSeconds: number,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode({ ...payload, exp });
  const sig = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

function pinRateLimitKey(tenantId: string, ip: string): string {
  return `pin:attempts:${tenantId}:${ip}`;
}

function loginRateLimitKey(tenantId: string, ip: string): string {
  return `login:attempts:${tenantId}:${ip}`;
}

interface ChallengePayload {
  type: 'login' | 'setup';
  userId: string;
  tenantId: string;
}

interface AuthUserPayload {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  fullName: string;
}

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly totpEncryptionKey: Buffer;
  private readonly appName: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    config: ConfigService,
  ) {
    this.jwtSecret = config.getOrThrow<string>('JWT_SECRET');
    const rawKey = config.getOrThrow<string>('TOTP_ENCRYPTION_KEY');
    this.totpEncryptionKey = Buffer.from(rawKey, 'hex');
    if (this.totpEncryptionKey.length !== 32) {
      throw new Error('TOTP_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    this.appName = config.get<string>('APP_NAME', 'Bonapp');
  }

  async pinLogin(
    tenantSlug: string,
    pin: string,
    ip = '0.0.0.0',
  ): Promise<{ accessToken: string }> {
    const tenant = await this.prisma.findTenantBySlug(tenantSlug);
    if (!tenant) throw new UnauthorizedException('Invalid credentials');

    const staffUsers = await this.prisma
      .forTenant(tenant.id)
      .user.findMany({
        where: { role: { in: ['CASHIER', 'WAITER', 'CHEF'] }, isActive: true, isBlocked: false },
        select: { id: true, role: true, pinHash: true, isBlocked: true },
      });

    let matchedUser: { id: string; role: string } | null = null;
    for (const user of staffUsers) {
      const isLegacyPin = user.pinHash !== null && /^\d{4}$/.test(user.pinHash);
      const pinMatches = user.pinHash && (isLegacyPin
        ? pin === user.pinHash
        : await compare(pin, user.pinHash));
      if (!user.isBlocked && pinMatches) {
        matchedUser = { id: user.id, role: user.role };
        if (isLegacyPin) {
          await this.prisma.forTenant(tenant.id).user.update({
            where: { id: user.id },
            data: { pinHash: await hash(pin, BCRYPT_COST) },
          });
        }
        break;
      }
    }

    if (!matchedUser) {
      await this.recordFailedAttempt(
        pinRateLimitKey(tenant.id, ip),
        PIN_ATTEMPTS_LIMIT,
        PIN_WINDOW_SECONDS,
        'Too many failed attempts. Please wait 15 minutes.',
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.cache.del(pinRateLimitKey(tenant.id, ip));

    const accessToken = createJwt(
      { tenantId: tenant.id, userId: matchedUser.id, role: matchedUser.role },
      this.jwtSecret,
      PIN_JWT_TTL_SECONDS,
    );
    return { accessToken };
  }

  async login(
    tenantSlug: string,
    email: string,
    password: string,
    ip = '0.0.0.0',
  ): Promise<{ accessToken: string; refreshToken: string; user: AuthUserPayload } | { challenge: string }> {
    const tenant = await this.prisma.findTenantBySlug(tenantSlug);
    if (!tenant) throw new UnauthorizedException('Invalid credentials');

    const user = await this.prisma.forTenant(tenant.id).user.findFirst({
      where: { email },
      select: {
        id: true,
        tenantId: true,
        email: true,
        fullName: true,
        role: true,
        passwordHash: true,
        totpEnabled: true,
        isActive: true,
        isBlocked: true,
      },
    });

    if (
      !user ||
      !user.isActive ||
      user.isBlocked ||
      !MANAGER_ROLES.has(user.role) ||
      !(await compare(password, user.passwordHash))
    ) {
      if (user?.isBlocked) throw new ForbiddenException('Аккаунт заблокирован');
      await this.recordFailedAttempt(
        loginRateLimitKey(tenant.id, ip),
        LOGIN_ATTEMPTS_LIMIT,
        LOGIN_WINDOW_SECONDS,
        'Too many login attempts. Please wait 15 minutes.',
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.cache.del(loginRateLimitKey(tenant.id, ip));

    if (user.totpEnabled) {
      const totpFailCount = await this.cache.getJson<number>(`totp:fails:${user.id}`);
      if (totpFailCount !== null && totpFailCount > TOTP_FAIL_LIMIT) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many TOTP verification attempts. Please wait.',
            retryAfter: TOTP_FAIL_WINDOW_SECONDS,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const challengeId = randomBytes(16).toString('hex');
      const payload: ChallengePayload = {
        type: 'login',
        userId: user.id,
        tenantId: tenant.id,
      };
      await this.cache.setJsonRequired(
        `totp:challenge:${challengeId}`,
        payload,
        LOGIN_CHALLENGE_TTL_SECONDS,
      );
      return { challenge: challengeId };
    }

    const accessToken = createJwt(
      { tenantId: tenant.id, userId: user.id, role: user.role },
      this.jwtSecret,
      MANAGER_JWT_TTL_SECONDS,
    );
    return { accessToken, refreshToken: this.createRefreshToken(user), user: this.authUser(user) };
  }

  async loginLegacy(login: string, password: string, ip: string): Promise<{ accessToken: string; refreshToken: string; user: AuthUserPayload } | { challenge: string }> {
    const normalized = login.trim().toLowerCase();
    const users = await this.prisma.unscopedClient.user.findMany({
      where: { OR: [{ email: normalized }, { phone: login.trim() }], isActive: true },
      take: 2,
      select: { id: true, tenantId: true, email: true },
    });
    if (users.length !== 1) throw new UnauthorizedException('Invalid credentials');
    const tenant = await this.prisma.findTenantById(users[0].tenantId);
    if (!tenant) throw new UnauthorizedException('Invalid credentials');
    return this.login(tenant.slug, users[0].email, password, ip);
  }

  private authUser(user: AuthUserPayload): AuthUserPayload {
    return { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId, fullName: user.fullName };
  }

  private createRefreshToken(user: AuthUserPayload): string {
    return createJwt(
      { tenantId: user.tenantId, userId: user.id, role: user.role, type: 'refresh' },
      this.jwtSecret,
      REFRESH_JWT_TTL_SECONDS,
    );
  }

  async setup2fa(
    userId: string,
    tenantId: string,
  ): Promise<{
    secret: string;
    otpAuthUri: string;
    setupChallenge: string;
  }> {
    const user = await this.prisma.forTenant(tenantId).user.findFirst({
      where: { id: userId },
      select: { id: true, role: true, email: true, totpEnabled: true },
    });

    if (!user || !MANAGER_ROLES.has(user.role)) {
      throw new ForbiddenException('Only OWNER or MANAGER can set up 2FA');
    }
    if (user.totpEnabled) {
      throw new ForbiddenException('TOTP is already active. Disable it before re-configuring.');
    }

    const { secretBase32 } = totpGenerateSecret();
    const encrypted = encryptTotpSecret(secretBase32, this.totpEncryptionKey);

    await this.prisma.forTenant(tenantId).user.update({
      where: { id: userId },
      data: { totpSecret: encrypted, totpEnabled: false },
    });

    const challengeId = randomBytes(16).toString('hex');
    const payload: ChallengePayload = {
      type: 'setup',
      userId: user.id,
      tenantId,
    };
    await this.cache.setJsonRequired(
      `totp:challenge:${challengeId}`,
      payload,
      SETUP_CHALLENGE_TTL_SECONDS,
    );

    return {
      secret: secretBase32,
      otpAuthUri: buildOtpAuthUri(secretBase32, user.email, this.appName),
      setupChallenge: challengeId,
    };
  }

  async verify2fa(
    challenge: string,
    code: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: AuthUserPayload } | { totpEnabled: boolean }> {
    const stored = await this.cache.consumeJson<ChallengePayload>(
      `totp:challenge:${challenge}`,
    );
    if (!stored) throw new UnauthorizedException('Invalid or expired challenge');

    const user = await this.prisma
      .forTenant(stored.tenantId)
      .user.findFirst({
        where: { id: stored.userId },
        select: { id: true, tenantId: true, email: true, fullName: true, role: true, totpSecret: true, totpEnabled: true, isBlocked: true, isActive: true },
      });

    if (user?.isBlocked) throw new ForbiddenException('Аккаунт заблокирован');
    if (!user || user.isActive === false || !user.totpSecret) {
      throw new UnauthorizedException('TOTP not configured for this user');
    }

    const secretBase32 = decryptTotpSecret(
      user.totpSecret,
      this.totpEncryptionKey,
    );

    const totpFailKey = `totp:fails:${user.id}`;

    const counter = totpVerifyGetCounter(secretBase32, code);
    if (counter === null) {
      await this.recordFailedAttempt(
        totpFailKey,
        TOTP_FAIL_LIMIT,
        TOTP_FAIL_WINDOW_SECONDS,
        'Too many TOTP verification attempts. Please wait.',
      );
      throw new UnauthorizedException('Invalid TOTP code');
    }

    const usedKey = `totp:used:${user.id}:${counter}`;
    // TTL covers the full window in which this counter can still be valid
    const totpUsedTtl = TOTP_STEP_SECONDS * (TOTP_WINDOW * 2 + 2);
    const marked = await this.cache.setJsonIfAbsent(usedKey, 1, totpUsedTtl);
    if (!marked) {
      await this.recordFailedAttempt(
        totpFailKey,
        TOTP_FAIL_LIMIT,
        TOTP_FAIL_WINDOW_SECONDS,
        'Too many TOTP verification attempts. Please wait.',
      );
      throw new UnauthorizedException('TOTP code already used');
    }

    await this.cache.del(totpFailKey);

    if (stored.type === 'setup') {
      await this.prisma.forTenant(stored.tenantId).user.update({
        where: { id: stored.userId },
        data: { totpEnabled: true },
      });
      return { totpEnabled: true };
    }

    const accessToken = createJwt(
      { tenantId: stored.tenantId, userId: user.id, role: user.role },
      this.jwtSecret,
      MANAGER_JWT_TTL_SECONDS,
    );
    return { accessToken, refreshToken: this.createRefreshToken(user), user: this.authUser(user) };
  }

  async hashPin(pin: string): Promise<string> {
    return hash(pin, BCRYPT_COST);
  }

  isStaffRole(role: string): boolean {
    return STAFF_ROLES.has(role);
  }

  private async recordFailedAttempt(
    key: string,
    limit: number,
    windowSeconds: number,
    message: string,
  ): Promise<void> {
    const attempts = await this.cache.increment(key, windowSeconds);
    if (attempts > limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message,
          retryAfter: windowSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
