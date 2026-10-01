import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { SuperadminScopeGuard } from './superadmin-scope.guard';

describe('SuperadminScopeGuard', () => {
  const guard = new SuperadminScopeGuard();
  const context = (staffUser: unknown) => ({
    switchToHttp: () => ({ getRequest: () => ({ staffUser }) }),
  }) as ExecutionContext;

  it('allows a SuperAdmin access token carrying the isolated scope', () => {
    expect(guard.canActivate(context({ role: UserRole.SUPER_ADMIN, scope: 'superadmin' }))).toBe(true);
  });

  it('rejects an ordinary access token even when the stored account role is SuperAdmin', () => {
    expect(() => guard.canActivate(context({ role: UserRole.SUPER_ADMIN, scope: 'tenant' }))).toThrow(ForbiddenException);
  });

  it('rejects a tenant-scoped OWNER token', () => {
    expect(() => guard.canActivate(context({ role: UserRole.OWNER, scope: 'tenant' }))).toThrow(ForbiddenException);
  });

  it('rejects a legacy access token without an explicit scope', () => {
    expect(() => guard.canActivate(context({ role: UserRole.SUPER_ADMIN }))).toThrow(ForbiddenException);
  });
});
