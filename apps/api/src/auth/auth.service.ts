import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import type Redis from 'ioredis';
import { LoginDto } from './dto/login.dto';
import { PinLoginDto } from './dto/pin-login.dto';
import { TotpVerifyDto } from './dto/totp-verify.dto';

const PIN_ROLES = ['CASHIER', 'WAITER', 'CHEF'];
const MANAGER_ROLES = ['OWNER', 'MANAGER'];
const TOTP_ALGORITHM = 'aes-256-gcm';
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SEC = 900; // 15 minutes
const CHALLENGE_TTL_SEC = 300; // 5 minutes

interface ChallengePayload {
  sub: string;
  tenantId: string;
  type: string;
  jti: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async pinLogin(dto: PinLoginDto, ip: string): Promise<{ access_token: string }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
    });
    if (!tenant) throw new UnauthorizedException('Invalid credentials');

    await this.checkRateLimit(tenant.id, ip);

    const users = await this.prisma.user.findMany({
      where: { tenantId: tenant.id, role: { in: PIN_ROLES } },
    });

    for (const user of users) {
      if (user.pinHash && (await bcrypt.compare(dto.pin, user.pinHash))) {
        await this.resetRateLimit(tenant.id, ip);
        return { access_token: this.issueAccessToken(user.id, user.role, tenant.id) };
      }
    }

    await this.incrementFailedAttempt(tenant.id, ip);
    throw new UnauthorizedException('Invalid credentials');
  }

  async login(
    dto: LoginDto,
  ): Promise<{ access_token: string } | { requires_2fa: true; challenge: string }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
    });
    if (!tenant) throw new UnauthorizedException('Invalid credentials');

    const user = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, email: dto.email, role: { in: MANAGER_ROLES } },
    });
    if (!user?.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (user.totpEnabled) {
      const jti = randomUUID();
      const challenge = this.jwtService.sign(
        { sub: user.id, tenantId: tenant.id, type: '2fa_challenge', jti },
        { expiresIn: '5m' },
      );
      await this.redis.setex(`challenge:${jti}`, CHALLENGE_TTL_SEC, '1');
      return { requires_2fa: true, challenge };
    }

    return { access_token: this.issueAccessToken(user.id, user.role, tenant.id) };
  }

  async setup2fa(
    userId: string,
  ): Promise<{ provisioning_uri: string; qr_code: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !MANAGER_ROLES.includes(user.role)) {
      throw new UnauthorizedException('2FA setup is only available for OWNER/MANAGER');
    }

    const secret = authenticator.generateSecret();
    const encryptedSecret = this.encryptTotp(secret);

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: encryptedSecret, totpEnabled: false },
    });

    const provisioningUri = authenticator.keyuri(user.email, 'Bonapp', secret);
    const qrCode = await qrcode.toDataURL(provisioningUri);

    return { provisioning_uri: provisioningUri, qr_code: qrCode };
  }

  async verify2fa(
    dto: TotpVerifyDto,
    userId?: string,
  ): Promise<{ access_token: string } | { success: true }> {
    if (dto.challenge) {
      return this.completeChallengeLogin(dto.challenge, dto.code);
    }
    if (userId) {
      return this.confirmTotpSetup(userId, dto.code);
    }
    throw new UnauthorizedException('Missing challenge or authentication');
  }

  private async completeChallengeLogin(
    challenge: string,
    code: string,
  ): Promise<{ access_token: string }> {
    let payload: ChallengePayload;
    try {
      payload = this.jwtService.verify<ChallengePayload>(challenge);
    } catch {
      throw new UnauthorizedException('Invalid or expired challenge');
    }
    if (payload.type !== '2fa_challenge') {
      throw new UnauthorizedException('Invalid challenge type');
    }

    const isActive = await this.redis.exists(`challenge:${payload.jti}`);
    if (!isActive) throw new UnauthorizedException('Challenge already used or expired');

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.totpSecret) throw new UnauthorizedException('2FA not configured');

    const secret = this.decryptTotp(user.totpSecret);
    if (!authenticator.check(code, secret)) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    await this.redis.del(`challenge:${payload.jti}`);
    return { access_token: this.issueAccessToken(user.id, user.role, payload.tenantId) };
  }

  private async confirmTotpSetup(
    userId: string,
    code: string,
  ): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.totpSecret) throw new UnauthorizedException('2FA not configured');

    const secret = this.decryptTotp(user.totpSecret);
    if (!authenticator.check(code, secret)) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true },
    });

    return { success: true };
  }

  private issueAccessToken(userId: string, role: string, tenantId: string): string {
    return this.jwtService.sign(
      { sub: userId, role, tenantId, type: 'access' },
      { expiresIn: this.config.get('JWT_EXPIRATION', '15m') },
    );
  }

  private async checkRateLimit(tenantId: string, ip: string): Promise<void> {
    const count = await this.redis.get(this.rateLimitKey(tenantId, ip));
    if (count !== null && parseInt(count, 10) >= RATE_LIMIT_MAX) {
      const ttl = await this.redis.ttl(this.rateLimitKey(tenantId, ip));
      throw new HttpException(
        {
          message: 'Too many failed attempts. Please wait 15 minutes or contact your manager.',
          retryAfter: ttl,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async incrementFailedAttempt(tenantId: string, ip: string): Promise<void> {
    const key = this.rateLimitKey(tenantId, ip);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, RATE_LIMIT_WINDOW_SEC);
    }
    if (count >= RATE_LIMIT_MAX) {
      console.warn(`[auth] PIN rate limit reached: tenant=${tenantId} ip=${ip}`);
    }
  }

  private async resetRateLimit(tenantId: string, ip: string): Promise<void> {
    await this.redis.del(this.rateLimitKey(tenantId, ip));
  }

  private rateLimitKey(tenantId: string, ip: string): string {
    return `pin:rl:${tenantId}:${ip}`;
  }

  private encryptTotp(plainSecret: string): string {
    const key = Buffer.from(this.config.getOrThrow<string>('TOTP_ENCRYPTION_KEY'), 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(TOTP_ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plainSecret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
  }

  private decryptTotp(stored: string): string {
    const [ivHex, tagHex, encHex] = stored.split(':');
    const key = Buffer.from(this.config.getOrThrow<string>('TOTP_ENCRYPTION_KEY'), 'hex');
    const decipher = crypto.createDecipheriv(
      TOTP_ALGORITHM,
      key,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return (
      decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') +
      decipher.final('utf8')
    );
  }
}
