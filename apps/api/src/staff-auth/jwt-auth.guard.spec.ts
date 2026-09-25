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
        user: { findFirst: jest.fn().mockResolvedValue({ mustChangePassword: true }) },
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
        user: { findFirst: jest.fn().mockResolvedValue({ mustChangePassword: true }) },
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
        user: { findFirst: jest.fn().mockResolvedValue({ isBlocked: true, mustChangePassword: false }) },
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
});
