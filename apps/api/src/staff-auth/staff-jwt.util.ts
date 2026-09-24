import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { UserRole } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import { StaffJwtPayload } from './staff-auth.dto';

const JWT_HEADER = Buffer.from(
  JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
).toString('base64url');

export function signToken(
  payload: Omit<StaffJwtPayload, 'iat'>,
  secret: string,
): string {
  const fullPayload: StaffJwtPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
  };
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString(
    'base64url',
  );
  const signature = createHmac('sha256', secret)
    .update(`${JWT_HEADER}.${encodedPayload}`)
    .digest('base64url');
  return `${JWT_HEADER}.${encodedPayload}.${signature}`;
}

export function verifyToken(
  token: string,
  secret: string,
): StaffJwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new UnauthorizedException();
  const [encodedHeader, encodedPayload, signature] = parts as [
    string,
    string,
    string,
  ];

  try {
    const header = JSON.parse(
      Buffer.from(encodedHeader, 'base64url').toString('utf8'),
    ) as { alg?: unknown };
    if (header.alg !== 'HS256') throw new UnauthorizedException();

    const expectedSig = createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest();
    const providedSig = Buffer.from(signature, 'base64url');

    if (
      providedSig.length !== expectedSig.length ||
      !timingSafeEqual(providedSig, expectedSig)
    ) {
      throw new UnauthorizedException();
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload['exp'] !== 'number' || payload['exp'] <= now) {
      throw new UnauthorizedException();
    }

    if (
      typeof payload['sub'] !== 'string' ||
      typeof payload['userId'] !== 'string' ||
      typeof payload['tenantId'] !== 'string' ||
      typeof payload['role'] !== 'string' ||
      typeof payload['type'] !== 'string' ||
      typeof payload['jti'] !== 'string'
    ) {
      throw new UnauthorizedException();
    }

    return payload as unknown as StaffJwtPayload;
  } catch (error) {
    if (error instanceof UnauthorizedException) throw error;
    throw new UnauthorizedException();
  }
}

export function buildTokenPair(
  userId: string,
  tenantId: string,
  role: UserRole,
  secret: string,
): { accessToken: string; refreshToken: string; refreshJti: string } {
  const now = Math.floor(Date.now() / 1000);
  const accessJti = randomUUID();
  const refreshJti = randomUUID();

  const accessToken = signToken(
    {
      sub: userId,
      userId,
      tenantId,
      role,
      type: 'access',
      jti: accessJti,
      exp: now + 15 * 60,
    },
    secret,
  );

  const refreshToken = signToken(
    {
      sub: userId,
      userId,
      tenantId,
      role,
      type: 'refresh',
      jti: refreshJti,
      exp: now + 7 * 24 * 60 * 60,
    },
    secret,
  );

  return { accessToken, refreshToken, refreshJti };
}
