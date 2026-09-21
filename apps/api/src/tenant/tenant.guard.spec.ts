import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantContextService } from './tenant-context.service';
import { TenantGuard } from './tenant.guard';

describe('TenantGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn<boolean, [string, unknown[]]>().mockReturnValue(false),
  } as unknown as Reflector;
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;

  it('requires a tenant context unless the route opts out', () => {
    const service = new TenantContextService();
    const guard = new TenantGuard(service, reflector);
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(service.run('tenant-a', () => guard.canActivate(context))).toBe(true);
  });
});
