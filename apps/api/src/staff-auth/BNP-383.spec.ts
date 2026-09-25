import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { JwtAuthGuard, StaffRequest } from './jwt-auth.guard';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

describe('BNP-383: protected route authentication and role checks', () => {
  const handler = {};
  const context = (staffUser?: StaffRequest['staffUser']) => ({
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => ({ staffUser }) }),
  }) as never;

  it('rejects a protected request without a bearer token', async () => {
    const guard = new JwtAuthGuard(
      { getOrThrow: () => 'test-secret' } as unknown as ConfigService,
      {} as PrismaService,
    );
    const request = { headers: {} } as StaffRequest;
    const jwtContext = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
    } as never;

    await expect(guard.canActivate(jwtContext)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unauthenticated request to a role-protected route', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.OWNER]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [handler, expect.any(Function)]);
  });

  it('rejects an authenticated user without the required role', () => {
    const guard = new RolesGuard({
      getAllAndOverride: () => [UserRole.OWNER],
    } as unknown as Reflector);
    expect(() => guard.canActivate(context({ userId: 'user-1', tenantId: 'tenant-1', role: UserRole.WAITER })))
      .toThrow(ForbiddenException);
  });

  it('allows an authenticated user with the required role', () => {
    const guard = new RolesGuard({
      getAllAndOverride: () => [UserRole.WAITER],
    } as unknown as Reflector);
    expect(guard.canActivate(context({ userId: 'user-1', tenantId: 'tenant-1', role: UserRole.WAITER })))
      .toBe(true);
  });
});
