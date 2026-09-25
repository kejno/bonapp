import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from './auth.guard';

function mockContext(authHeader?: string): {
  context: ExecutionContext;
  request: { headers: Record<string, string>; user?: { tenantId: string } };
} {
  const request: {
    headers: Record<string, string>;
    user?: { tenantId: string };
  } = {
    headers: authHeader ? { authorization: authHeader } : {},
  };
  return {
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
    request,
  };
}

function createToken(payload: Record<string, unknown>, secret: string): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode(payload);
  const signature = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function makeGuard(secret = 'test-jwt-secret'): AuthGuard {
  const config = { getOrThrow: () => secret } as unknown as ConfigService;
  const prisma = {
    forTenant: () => ({
      user: { findFirst: jest.fn().mockResolvedValue({ mustChangePassword: false }) },
    }),
  };
  return new AuthGuard(config, prisma as unknown as PrismaService);
}

describe('AuthGuard', () => {
  let guard: AuthGuard;

  beforeEach(() => {
    guard = makeGuard();
  });

  it('validates a JWT and assigns its tenant context to the request', async () => {
    const token = createToken(
      { tenantId: 'tenant-1', sub: 'user-1', type: 'access', role: 'OWNER' },
      'test-jwt-secret',
    );
    const { context, request } = mockContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      tenantId: 'tenant-1',
      userId: 'user-1',
      role: 'OWNER',
    });
  });

  it('should throw UnauthorizedException when Authorization header is absent', async () => {
    const { context } = mockContext();
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token with an invalid signature or missing tenant claim', async () => {
    const invalidSignature = createToken(
      { tenantId: 'tenant-1' },
      'other-secret',
    );
    const noTenant = createToken({}, 'test-jwt-secret');

    await expect(
      guard.canActivate(mockContext(`Bearer ${invalidSignature}`).context),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      guard.canActivate(mockContext(`Bearer ${noTenant}`).context),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const expiredToken = createToken(
      { tenantId: 'tenant-1', exp: Math.floor(Date.now() / 1000) - 1 },
      'test-jwt-secret',
    );

    await expect(
      guard.canActivate(mockContext(`Bearer ${expiredToken}`).context),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token with an unknown role', async () => {
    const token = createToken(
      { tenantId: 'tenant-1', sub: 'user-1', role: 'UNKNOWN' },
      'test-jwt-secret',
    );

    await expect(guard.canActivate(mockContext(`Bearer ${token}`).context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a refresh token even when it has a valid signature', async () => {
    const refreshToken = createToken(
      {
        tenantId: 'tenant-1',
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
        type: 'refresh',
      },
      'test-jwt-secret',
    );

    await expect(
      guard.canActivate(mockContext(`Bearer ${refreshToken}`).context),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('blocks staff whose password must be changed', async () => {
    const config = { getOrThrow: () => 'test-jwt-secret' } as unknown as ConfigService;
    const prisma = {
      forTenant: () => ({
        user: { findFirst: jest.fn().mockResolvedValue({ mustChangePassword: true }) },
      }),
    };
    const guarded = new AuthGuard(config, prisma as unknown as PrismaService);
    const token = createToken(
      { tenantId: 'tenant-1', sub: 'user-1', type: 'access', role: 'OWNER' },
      'test-jwt-secret',
    );

    await expect(
      guarded.canActivate(mockContext(`Bearer ${token}`).context),
    ).rejects.toThrow(ForbiddenException);
  });

  it('blocks staff using a legacy access token with only the sub claim', async () => {
    const findFirst = jest.fn().mockResolvedValue({ mustChangePassword: true });
    const config = { getOrThrow: () => 'test-jwt-secret' } as unknown as ConfigService;
    const prisma = { forTenant: () => ({ user: { findFirst } }) };
    const guarded = new AuthGuard(config, prisma as unknown as PrismaService);
    const token = createToken(
      { tenantId: 'tenant-1', sub: 'staff-1', role: 'OWNER' },
      'test-jwt-secret',
    );

    await expect(
      guarded.canActivate(mockContext(`Bearer ${token}`).context),
    ).rejects.toThrow(ForbiddenException);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'staff-1', isActive: true, isBlocked: false },
      select: { mustChangePassword: true },
    });
  });

  it('rejects blocked staff and includes the block state in the database query', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const config = { getOrThrow: () => 'test-jwt-secret' } as unknown as ConfigService;
    const prisma = {
      forTenant: () => ({ user: { findFirst } }),
    };
    const guarded = new AuthGuard(config, prisma as unknown as PrismaService);
    const token = createToken(
      { tenantId: 'tenant-1', userId: 'staff-1', type: 'access', role: 'OWNER' },
      'test-jwt-secret',
    );

    await expect(
      guarded.canActivate(mockContext(`Bearer ${token}`).context),
    ).rejects.toThrow(UnauthorizedException);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'staff-1', isActive: true, isBlocked: false },
      select: { mustChangePassword: true },
    });
  });

  it('preserves valid legacy tenant tokens without a matching staff account', async () => {
    const config = { getOrThrow: () => 'test-jwt-secret' } as unknown as ConfigService;
    const prisma = {
      forTenant: () => ({ user: { findFirst: jest.fn().mockResolvedValue(null) } }),
    };
    const guarded = new AuthGuard(config, prisma as unknown as PrismaService);
    const token = createToken(
      { tenantId: 'tenant-1', sub: 'legacy-user', role: 'OWNER' },
      'test-jwt-secret',
    );

    await expect(
      guarded.canActivate(mockContext(`Bearer ${token}`).context),
    ).resolves.toBe(true);
  });

  it('throws at construction when JWT_SECRET is not configured', () => {
    const config = {
      getOrThrow: (key: string) => {
        throw new Error(`Config key "${key}" not found`);
      },
    } as unknown as ConfigService;
    expect(
      () => new AuthGuard(config, {} as unknown as PrismaService),
    ).toThrow('Config key "JWT_SECRET" not found');
  });
});
