import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare } from 'bcryptjs';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { AuthUserDto, LoginResponseDto } from './dto/login-response.dto';

const ACCESS_TOKEN_TTL = 8 * 60 * 60; // 8 hours
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days

interface UserRow {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: string;
  isBlocked: boolean;
  totpEnabled: boolean;
  totpSecret: string | null;
}

export interface LoginInternalResult extends LoginResponseDto {
  refreshToken?: string;
}

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.jwtSecret = config.getOrThrow<string>('JWT_SECRET');
  }

  async login(dto: LoginDto): Promise<LoginInternalResult> {
    const user = await this.findUser(dto.login);

    if (!user) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    if (user.isBlocked) {
      throw new ForbiddenException('Аккаунт заблокирован');
    }

    const passwordValid = await compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    if (user.totpEnabled && user.totpSecret) {
      if (!dto.totpCode) {
        return { requiresTOTP: true };
      }
      if (!verifyTOTP(user.totpSecret, dto.totpCode)) {
        throw new UnauthorizedException('Неверный код 2FA');
      }
    }

    const accessToken = this.generateToken(user, ACCESS_TOKEN_TTL, 'access');
    const refreshToken = this.generateToken(user, REFRESH_TOKEN_TTL, 'refresh');

    const authUser: AuthUserDto = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      fullName: user.fullName,
    };

    return { accessToken, refreshToken, user: authUser };
  }

  private async findUser(login: string): Promise<UserRow | null> {
    const normalised = login.trim().toLowerCase();
    const users = await this.prisma.unscopedClient.user.findMany({
      where: {
        OR: [{ email: normalised }, { phone: login.trim() }],
        isActive: true,
      },
      take: 2,
      select: {
        id: true,
        tenantId: true,
        email: true,
        passwordHash: true,
        fullName: true,
        role: true,
        isBlocked: true,
        totpEnabled: true,
        totpSecret: true,
      },
    });
    return users.length === 1 ? users[0] : null;
  }

  private generateToken(
    user: Pick<UserRow, 'id' | 'tenantId' | 'role' | 'email'>,
    expiresInSeconds: number,
    type: 'access' | 'refresh',
  ): string {
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');

    const now = Math.floor(Date.now() / 1000);
    const claims: Record<string, unknown> = {
      sub: user.id,
      tenantId: user.tenantId,
      iat: now,
      exp: now + expiresInSeconds,
    };
    if (type === 'access') {
      claims['role'] = user.role;
      claims['email'] = user.email;
    } else {
      claims['type'] = 'refresh';
    }

    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = createHmac('sha256', this.jwtSecret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    return `${header}.${payload}.${signature}`;
  }
}

function base32Decode(encoded: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of encoded.toUpperCase().replace(/=+$/, '')) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function computeHOTP(key: Buffer, counter: bigint): string {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(counter);
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1_000_000;
  return code.toString().padStart(6, '0');
}

export function verifyTOTP(
  secret: string,
  code: string,
  window = 1,
): boolean {
  const key = base32Decode(secret);
  const counter = BigInt(Math.floor(Date.now() / 1000 / 30));
  for (let delta = -window; delta <= window; delta++) {
    if (computeHOTP(key, counter + BigInt(delta)) === code) return true;
  }
  return false;
}
