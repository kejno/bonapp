import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../cache/cache.constants';
import { PrismaService } from '../prisma/prisma.service';
import { buildTokenPair, verifyToken } from './staff-jwt.util';
import { LoginResponse, TokenPair } from './staff-auth.dto';

const BCRYPT_COST = 12;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const MIN_PASSWORD_LENGTH = 8;

function rtBlacklistKey(jti: string): string {
  return `rt_blacklist:${jti}`;
}

function loginAttemptsKey(ip: string): string {
  return `login_attempts:${ip}`;
}

@Injectable()
export class StaffAuthService {
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('JWT_SECRET');
  }

  async login(
    tenantId: string,
    email: string,
    password: string,
    ip: string,
  ): Promise<LoginResponse> {
    await this.checkRateLimit(ip);

    const db = this.prisma.forTenant(tenantId);
    const user = await db.user.findFirst({
      where: { email, isActive: true },
    });

    if (!user) {
      await this.incrementAttempts(ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await this.incrementAttempts(ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.resetAttempts(ip);

    const { accessToken, refreshToken } = buildTokenPair(
      user.id,
      tenantId,
      user.role,
      this.secret,
    );

    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken,
      refreshToken,
      mustChangePassword: user.mustChangePassword,
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = verifyToken(refreshToken, this.secret);

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException();
    }

    const ttlRemaining = payload.exp - Math.floor(Date.now() / 1000);
    if (ttlRemaining <= 0) throw new UnauthorizedException();

    const db = this.prisma.forTenant(payload.tenantId);
    const user = await db.user.findFirst({
      where: { id: payload.userId, isActive: true },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedException();

    const claimed = await this.redis.set(
      rtBlacklistKey(payload.jti),
      '1',
      'EX',
      Math.min(ttlRemaining, REFRESH_TOKEN_TTL_SECONDS),
      'NX',
    );
    if (!claimed) throw new UnauthorizedException('Token has been revoked');

    const { accessToken, refreshToken: newRefreshToken } = buildTokenPair(
      payload.userId,
      payload.tenantId,
      payload.role,
      this.secret,
    );

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string): Promise<void> {
    let payload;
    try {
      payload = verifyToken(refreshToken, this.secret);
    } catch {
      return;
    }

    if (payload.type !== 'refresh') return;

    const ttlRemaining = payload.exp - Math.floor(Date.now() / 1000);
    if (ttlRemaining > 0) {
      await this.redis.set(
        rtBlacklistKey(payload.jti),
        '1',
        'EX',
        Math.min(ttlRemaining, REFRESH_TOKEN_TTL_SECONDS),
      );
    }
  }

  async changePassword(
    tenantId: string,
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        'New password must be at least 8 characters',
      );
    }

    const db = this.prisma.forTenant(tenantId);
    const user = await db.user.findFirst({
      where: { id: userId, isActive: true },
    });

    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid current password');

    const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await db.user.update({
      where: { id: userId },
      data: { passwordHash: hash, mustChangePassword: false },
    });
  }

  private async checkRateLimit(ip: string): Promise<void> {
    const count = await this.redis.get(loginAttemptsKey(ip));
    if (count !== null && parseInt(count, 10) >= RATE_LIMIT_MAX) {
      throw new HttpException('Too many login attempts', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async incrementAttempts(ip: string): Promise<void> {
    const key = loginAttemptsKey(ip);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }
  }

  private async resetAttempts(ip: string): Promise<void> {
    await this.redis.del(loginAttemptsKey(ip));
  }
}
