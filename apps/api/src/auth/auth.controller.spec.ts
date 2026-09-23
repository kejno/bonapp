import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const mockAuthService = {
  pinLogin: jest.fn(),
  login: jest.fn(),
  setup2fa: jest.fn(),
  verify2fa: jest.fn(),
};

function makeController(): AuthController {
  return new AuthController(mockAuthService as unknown as AuthService);
}

function makeRequest(ip = '127.0.0.1', user?: { tenantId: string; userId?: string }) {
  return { ip, user } as never;
}

beforeEach(() => jest.clearAllMocks());

describe('AuthController — POST /auth/pin-login', () => {
  it('delegates to authService.pinLogin and returns access token', async () => {
    mockAuthService.pinLogin.mockResolvedValue({ accessToken: 'jwt-token' });
    const controller = makeController();

    const result = await controller.pinLogin(
      { tenantSlug: 'my-cafe', pin: '1234' },
      makeRequest('10.0.0.1'),
    );

    expect(result).toEqual({ accessToken: 'jwt-token' });
    expect(mockAuthService.pinLogin).toHaveBeenCalledWith('my-cafe', '1234', '10.0.0.1');
  });

  it('falls back to 0.0.0.0 when req.ip is undefined', async () => {
    mockAuthService.pinLogin.mockResolvedValue({ accessToken: 'tok' });
    const controller = makeController();
    const req = { ip: undefined } as never;

    await controller.pinLogin({ tenantSlug: 'x', pin: '0000' }, req);

    expect(mockAuthService.pinLogin).toHaveBeenCalledWith('x', '0000', '0.0.0.0');
  });

  it('throws 400 when pin is missing', async () => {
    const controller = makeController();
    await expect(
      controller.pinLogin({ tenantSlug: 'x' }, makeRequest()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws 400 when pin has non-digit characters', async () => {
    const controller = makeController();
    await expect(
      controller.pinLogin({ tenantSlug: 'x', pin: '12ab' }, makeRequest()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws 400 when pin is fewer than 4 digits', async () => {
    const controller = makeController();
    await expect(
      controller.pinLogin({ tenantSlug: 'x', pin: '123' }, makeRequest()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws 400 when pin is more than 4 digits', async () => {
    const controller = makeController();
    await expect(
      controller.pinLogin({ tenantSlug: 'x', pin: '12345' }, makeRequest()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws 400 when tenantSlug is missing', async () => {
    const controller = makeController();
    await expect(
      controller.pinLogin({ pin: '1234' }, makeRequest()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('propagates 429 from authService', async () => {
    const err = new HttpException('Too many', HttpStatus.TOO_MANY_REQUESTS);
    mockAuthService.pinLogin.mockRejectedValue(err);
    const controller = makeController();
    await expect(
      controller.pinLogin({ tenantSlug: 'x', pin: '1234' }, makeRequest()),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });

  it('propagates 401 from authService', async () => {
    mockAuthService.pinLogin.mockRejectedValue(new UnauthorizedException());
    const controller = makeController();
    await expect(
      controller.pinLogin({ tenantSlug: 'x', pin: '1234' }, makeRequest()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthController — POST /auth/login', () => {
  it('returns access token when TOTP is not enabled', async () => {
    mockAuthService.login.mockResolvedValue({ accessToken: 'jwt' });
    const controller = makeController();

    const result = await controller.login({
      tenantSlug: 'cafe',
      email: 'owner@example.com',
      password: 'secret',
    });

    expect(result).toEqual({ accessToken: 'jwt' });
    expect(mockAuthService.login).toHaveBeenCalledWith('cafe', 'owner@example.com', 'secret');
  });

  it('returns challenge when TOTP is enabled', async () => {
    mockAuthService.login.mockResolvedValue({ challenge: 'abc123' });
    const controller = makeController();

    const result = await controller.login({
      tenantSlug: 'cafe',
      email: 'owner@example.com',
      password: 'secret',
    });

    expect(result).toEqual({ challenge: 'abc123' });
  });

  it('throws 400 when email is missing', async () => {
    const controller = makeController();
    await expect(
      controller.login({ tenantSlug: 'x', password: 'pw' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws 400 when password is missing', async () => {
    const controller = makeController();
    await expect(
      controller.login({ tenantSlug: 'x', email: 'a@b.com' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws 400 when tenantSlug is missing', async () => {
    const controller = makeController();
    await expect(
      controller.login({ email: 'a@b.com', password: 'pw' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('propagates 401 from authService', async () => {
    mockAuthService.login.mockRejectedValue(new UnauthorizedException());
    const controller = makeController();
    await expect(
      controller.login({ tenantSlug: 'x', email: 'a@b.com', password: 'pw' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthController — POST /auth/2fa/setup', () => {
  it('calls authService.setup2fa with userId and tenantId from JWT context', async () => {
    const setup = { secret: 'BASE32', otpAuthUri: 'otpauth://...', setupChallenge: 'ch-1' };
    mockAuthService.setup2fa.mockResolvedValue(setup);
    const controller = makeController();

    const result = await controller.setup2fa(
      makeRequest('1.1.1.1', { tenantId: 'tenant-1', userId: 'user-1' }),
    );

    expect(result).toEqual(setup);
    expect(mockAuthService.setup2fa).toHaveBeenCalledWith('user-1', 'tenant-1');
  });

  it('throws 400 when req.user.userId is missing', async () => {
    const controller = makeController();
    await expect(
      controller.setup2fa(makeRequest('1.1.1.1', { tenantId: 'tenant-1' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws 400 when req.user is absent', async () => {
    const controller = makeController();
    await expect(
      controller.setup2fa(makeRequest()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('propagates ForbiddenException from authService for non-manager roles', async () => {
    mockAuthService.setup2fa.mockRejectedValue(new ForbiddenException());
    const controller = makeController();
    await expect(
      controller.setup2fa(makeRequest('1.1.1.1', { tenantId: 't', userId: 'u' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AuthController — POST /auth/2fa/verify', () => {
  it('returns totpEnabled:true for a setup challenge', async () => {
    mockAuthService.verify2fa.mockResolvedValue({ totpEnabled: true });
    const controller = makeController();

    const result = await controller.verify2fa({ challenge: 'ch-id', code: '123456' });

    expect(result).toEqual({ totpEnabled: true });
    expect(mockAuthService.verify2fa).toHaveBeenCalledWith('ch-id', '123456');
  });

  it('returns accessToken for a login challenge', async () => {
    mockAuthService.verify2fa.mockResolvedValue({ accessToken: 'jwt' });
    const controller = makeController();

    const result = await controller.verify2fa({ challenge: 'ch-id', code: '654321' });

    expect(result).toHaveProperty('accessToken');
  });

  it('throws 400 when challenge is missing', async () => {
    const controller = makeController();
    await expect(
      controller.verify2fa({ code: '123456' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws 400 when code has non-digit characters', async () => {
    const controller = makeController();
    await expect(
      controller.verify2fa({ challenge: 'ch', code: '12345a' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws 400 when code is fewer than 6 digits', async () => {
    const controller = makeController();
    await expect(
      controller.verify2fa({ challenge: 'ch', code: '12345' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws 400 when code is more than 6 digits', async () => {
    const controller = makeController();
    await expect(
      controller.verify2fa({ challenge: 'ch', code: '1234567' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('propagates 401 for an expired or invalid challenge', async () => {
    mockAuthService.verify2fa.mockRejectedValue(new UnauthorizedException());
    const controller = makeController();
    await expect(
      controller.verify2fa({ challenge: 'bad', code: '000000' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
