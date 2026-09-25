import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { StaffAuthService } from '../staff-auth/staff-auth.service';

describe('AuthController', () => {
  const login = jest.fn();
  const service = { login } as unknown as AuthService;
  const staffLogin = jest.fn();
  const staffService = { login: staffLogin } as unknown as StaffAuthService;
  const controller = new AuthController(service, staffService);

  beforeEach(() => {
    login.mockClear();
    staffLogin.mockClear();
    login.mockResolvedValue({ refreshToken: 'refresh-token' });
    staffLogin.mockResolvedValue({
      accessToken: 'staff-access',
      refreshToken: 'staff-refresh',
      mustChangePassword: true,
    });
  });

  it('limits login attempts to five per minute per client', () => {
    const handler: unknown = Object.getOwnPropertyDescriptor(
      AuthController.prototype,
      'login',
    )!.value;
    if (typeof handler !== 'function') {
      throw new Error('Login handler is not defined');
    }

    expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler)).toBe(5);
    expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, handler)).toBe(60_000);
  });

  it('marks the refresh cookie secure in production', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const cookie = jest.fn();

    try {
      await controller.login(
        { login: 'admin@example.com', password: 'password' },
        { cookie } as never,
        { ip: '127.0.0.1' } as never,
      );
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }

    expect(cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token',
      expect.objectContaining({ secure: true }),
    );
  });

  it('permits the refresh cookie over HTTP only outside production', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const cookie = jest.fn();

    try {
      await controller.login(
        { login: 'admin@example.com', password: 'password' },
        { cookie } as never,
        { ip: '127.0.0.1' } as never,
      );
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }

    expect(cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token',
      expect.objectContaining({ secure: false }),
    );
  });

  it('routes tenant staff credentials to staff authentication', async () => {
    const cookie = jest.fn();

    const result = await controller.login(
      { tenantId: 'tenant-1', email: 'staff@example.com', password: 'password' },
      { cookie } as never,
      { ip: '203.0.113.4' } as never,
    );

    expect(staffLogin).toHaveBeenCalledWith(
      'tenant-1',
      'staff@example.com',
      'password',
      '203.0.113.4',
    );
    expect(login).not.toHaveBeenCalled();
    expect(result).toEqual({
      accessToken: 'staff-access',
      refreshToken: 'staff-refresh',
      mustChangePassword: true,
    });
    expect(cookie).not.toHaveBeenCalled();
  });
});
