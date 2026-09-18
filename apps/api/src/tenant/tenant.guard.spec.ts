import { UnauthorizedException } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';
import { TenantGuard } from './tenant.guard';

describe('TenantGuard', () => {
  let service: TenantContextService;
  let guard: TenantGuard;

  beforeEach(() => {
    service = new TenantContextService();
    guard = new TenantGuard(service);
  });

  it('throws UnauthorizedException when no tenant context is set', () => {
    expect(() => guard.canActivate({} as any)).toThrow(UnauthorizedException);
  });

  it('returns true when tenant context is set', () => {
    let result: boolean | undefined;
    service.run('tenant-a', () => {
      result = guard.canActivate({} as any);
    });
    expect(result).toBe(true);
  });

  it('throws for every call without context, not just the first', () => {
    expect(() => guard.canActivate({} as any)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate({} as any)).toThrow(UnauthorizedException);
  });
});
