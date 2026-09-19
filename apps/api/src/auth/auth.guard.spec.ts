import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';

function mockContext(authHeader?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authHeader ? { authorization: authHeader } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  let guard: AuthGuard;

  beforeEach(() => {
    guard = new AuthGuard();
  });

  it('should allow requests with Authorization header present', () => {
    const ctx = mockContext('Bearer some-token');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw UnauthorizedException when Authorization header is absent', () => {
    const ctx = mockContext();
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException for any request without auth, regardless of other headers', () => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'content-type': 'application/json' } }),
      }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
