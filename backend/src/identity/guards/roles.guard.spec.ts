import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { Role } from '../entities/user.entity.js';
import { RolesGuard } from './roles.guard.js';

const buildContext = (role: Role | undefined, requiredRoles: Role[] | undefined): ExecutionContext => {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(requiredRoles) };
  const handler = vi.fn();
  const getClass = vi.fn();
  return {
    getHandler: () => handler,
    getClass: () => getClass,
    switchToHttp: () => ({
      getRequest: () => ({ user: role !== undefined ? { role } : undefined }),
    }),
  } as unknown as ExecutionContext;
};

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();
    guard = module.get(RolesGuard);
    reflector = module.get(Reflector);
  });

  it('allows access when no roles are required', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = buildContext(Role.STAFF, undefined);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows access when required roles is empty array', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const ctx = buildContext(Role.STAFF, []);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows OWNER when OWNER role is required', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.OWNER]);
    const ctx = buildContext(Role.OWNER, [Role.OWNER]);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies STAFF when only OWNER role is required', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.OWNER]);
    const ctx = buildContext(Role.STAFF, [Role.OWNER]);
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('allows access when user has any of the required roles', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.OWNER, Role.STAFF]);
    const ctx = buildContext(Role.STAFF, [Role.OWNER, Role.STAFF]);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('uses ROLES_KEY when reading metadata', () => {
    const spy = vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.OWNER]);
    const ctx = buildContext(Role.OWNER, [Role.OWNER]);
    guard.canActivate(ctx);
    expect(spy).toHaveBeenCalledWith(ROLES_KEY, expect.any(Array));
  });

  it('returns false without TypeError when user is undefined and roles are required', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.OWNER]);
    const ctx = buildContext(undefined, [Role.OWNER]);
    expect(() => guard.canActivate(ctx)).not.toThrow();
    expect(guard.canActivate(ctx)).toBe(false);
  });
});
