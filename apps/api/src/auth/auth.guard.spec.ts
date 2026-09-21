import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
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
  return new AuthGuard(config);
}

describe('AuthGuard', () => {
  let guard: AuthGuard;

  beforeEach(() => {
    guard = makeGuard();
  });

  it('validates a JWT and assigns its tenant context to the request', () => {
    const token = createToken({ tenantId: 'tenant-1' }, 'test-jwt-secret');
    const { context, request } = mockContext(`Bearer ${token}`);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user).toEqual({ tenantId: 'tenant-1' });
  });

  it('should throw UnauthorizedException when Authorization header is absent', () => {
    const { context } = mockContext();
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a token with an invalid signature or missing tenant claim', () => {
    const invalidSignature = createToken(
      { tenantId: 'tenant-1' },
      'other-secret',
    );
    const noTenant = createToken({}, 'test-jwt-secret');

    expect(() =>
      guard.canActivate(mockContext(`Bearer ${invalidSignature}`).context),
    ).toThrow(UnauthorizedException);
    expect(() =>
      guard.canActivate(mockContext(`Bearer ${noTenant}`).context),
    ).toThrow(UnauthorizedException);
  });

  it('throws at construction when JWT_SECRET is not configured', () => {
    const config = {
      getOrThrow: (key: string) => {
        throw new Error(`Config key "${key}" not found`);
      },
    } as unknown as ConfigService;
    expect(() => new AuthGuard(config)).toThrow('Config key "JWT_SECRET" not found');
  });
});
