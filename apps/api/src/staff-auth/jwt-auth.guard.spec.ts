import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildTokenPair } from './staff-jwt.util';
import { JwtAuthGuard, StaffRequest } from './jwt-auth.guard';

const SECRET = 'test-secret';

function makeContext(request: StaffRequest, handlerName: string) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({ name: handlerName }),
  } as never;
}

describe('JwtAuthGuard', () => {
  it('blocks protected requests until the password is changed', async () => {
    const { accessToken } = buildTokenPair('user-1', 'tenant-1', UserRole.WAITER, SECRET);
    const prisma = {
      forTenant: () => ({
        user: { findFirst: jest.fn().mockResolvedValue({
          mustChangePassword: true,
          sessionVersion: 0,
          role: UserRole.WAITER,
        }) },
      }),
    };
    const guard = new JwtAuthGuard(
      { getOrThrow: () => SECRET } as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
    const request = { headers: { authorization: `Bearer ${accessToken}` } } as StaffRequest;

    await expect(guard.canActivate(makeContext(request, 'protectedAction'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows the password change operation while a change is required', async () => {
    const { accessToken } = buildTokenPair('user-1', 'tenant-1', UserRole.WAITER, SECRET);
    const prisma = {
      forTenant: () => ({
        user: { findFirst: jest.fn().mockResolvedValue({
          mustChangePassword: true,
          sessionVersion: 0,
          role: UserRole.WAITER,
        }) },
      }),
    };
    const guard = new JwtAuthGuard(
      { getOrThrow: () => SECRET } as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
    const request = { headers: { authorization: `Bearer ${accessToken}` } } as StaffRequest;

    await expect(guard.canActivate(makeContext(request, 'changePassword'))).resolves.toBe(true);
  });

  it('rejects already issued tokens for blocked users', async () => {
    const { accessToken } = buildTokenPair('user-1', 'tenant-1', UserRole.WAITER, SECRET);
    const prisma = {
      forTenant: () => ({
        user: { findFirst: jest.fn().mockResolvedValue({
          isBlocked: true,
          mustChangePassword: false,
          sessionVersion: 0,
          role: UserRole.WAITER,
        }) },
      }),
    };
    const guard = new JwtAuthGuard(
      { getOrThrow: () => SECRET } as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
    const request = { headers: { authorization: `Bearer ${accessToken}` } } as StaffRequest;

    await expect(guard.canActivate(makeContext(request, 'protectedAction'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects access tokens issued before the current session version', async () => {
    const { accessToken } = buildTokenPair('user-1', 'tenant-1', UserRole.WAITER, SECRET, 2);
    const findFirst = jest.fn().mockResolvedValue({
      isBlocked: false,
      mustChangePassword: false,
      sessionVersion: 3,
      role: UserRole.WAITER,
    });
    const prisma = { forTenant: () => ({ user: { findFirst } }) };
    const guard = new JwtAuthGuard(
      { getOrThrow: () => SECRET } as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
    const request = { headers: { authorization: `Bearer ${accessToken}` } } as StaffRequest;

    await expect(guard.canActivate(makeContext(request, 'protectedAction'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('uses the current database role instead of the role in an access token', async () => {
    const { accessToken } = buildTokenPair('user-1', 'tenant-1', UserRole.OWNER, SECRET);
    const prisma = {
      forTenant: () => ({
        user: {
          findFirst: jest.fn().mockResolvedValue({
            isBlocked: false,
            mustChangePassword: false,
            sessionVersion: 0,
            role: UserRole.WAITER,
          }),
        },
      }),
    };
    const guard = new JwtAuthGuard(
      { getOrThrow: () => SECRET } as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
    const request = { headers: { authorization: `Bearer ${accessToken}` } } as StaffRequest;

    await expect(guard.canActivate(makeContext(request, 'protectedAction'))).resolves.toBe(true);
    expect(request.staffUser?.role).toBe(UserRole.WAITER);
  });
});
