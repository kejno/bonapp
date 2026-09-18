import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));
jest.mock('otplib', () => ({
  authenticator: { generateSecret: jest.fn(), keyuri: jest.fn(), check: jest.fn() },
}));
jest.mock('qrcode', () => ({ toDataURL: jest.fn() }));

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard, OptionalJwtAuthGuard } from './guards/jwt-auth.guard';
import { Request } from 'express';

const mockAuthService = {
  pinLogin: jest.fn(),
  login: jest.fn(),
  setup2fa: jest.fn(),
  verify2fa: jest.fn(),
};

const makeGuardOverride =
  (withUser: boolean) =>
  (ctx: any) => {
    if (withUser) {
      ctx.switchToHttp().getRequest().user = {
        sub: 'user-1',
        role: 'OWNER',
        tenantId: 't-1',
        type: 'access',
      };
    }
    return true;
  };

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: makeGuardOverride(true) })
      .overrideGuard(OptionalJwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          const auth: string | undefined = req.headers?.authorization;
          if (auth?.startsWith('Bearer ')) {
            req.user = { sub: 'user-1', role: 'OWNER', tenantId: 't-1', type: 'access' };
          }
          return true;
        },
      })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('POST /pin-login', () => {
    it('should extract first IP from x-forwarded-for header', async () => {
      mockAuthService.pinLogin.mockResolvedValue({ access_token: 'tok' });
      const req = {
        headers: { 'x-forwarded-for': '10.0.0.1, 192.168.1.1' },
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      await controller.pinLogin({ pin: '1234', tenantSlug: 'resto' }, req);

      expect(mockAuthService.pinLogin).toHaveBeenCalledWith(
        { pin: '1234', tenantSlug: 'resto' },
        '10.0.0.1',
      );
    });

    it('should fall back to socket.remoteAddress when header absent', async () => {
      mockAuthService.pinLogin.mockResolvedValue({ access_token: 'tok' });
      const req = {
        headers: {},
        socket: { remoteAddress: '172.16.0.5' },
      } as unknown as Request;

      await controller.pinLogin({ pin: '1234', tenantSlug: 'resto' }, req);

      expect(mockAuthService.pinLogin).toHaveBeenCalledWith(expect.anything(), '172.16.0.5');
    });

    it('should fall back to 0.0.0.0 when no IP available', async () => {
      mockAuthService.pinLogin.mockResolvedValue({ access_token: 'tok' });
      const req = {
        headers: {},
        socket: { remoteAddress: undefined },
      } as unknown as Request;

      await controller.pinLogin({ pin: '1234', tenantSlug: 'resto' }, req);

      expect(mockAuthService.pinLogin).toHaveBeenCalledWith(expect.anything(), '0.0.0.0');
    });
  });

  describe('POST /login', () => {
    it('should delegate to authService.login and return result', async () => {
      mockAuthService.login.mockResolvedValue({ access_token: 'tok' });
      const dto = { email: 'a@b.com', password: 'pw', tenantSlug: 'resto' };

      const result = await controller.login(dto);

      expect(result).toEqual({ access_token: 'tok' });
      expect(mockAuthService.login).toHaveBeenCalledWith(dto);
    });
  });

  describe('POST /2fa/setup', () => {
    it('should pass user.sub from JWT payload to authService.setup2fa', async () => {
      mockAuthService.setup2fa.mockResolvedValue({
        qr_code: 'data:...',
        provisioning_uri: 'otpauth://...',
      });
      const req = {
        user: { sub: 'user-1', role: 'OWNER', tenantId: 't-1', type: 'access' },
      } as any;

      await controller.setup2fa(req);

      expect(mockAuthService.setup2fa).toHaveBeenCalledWith('user-1');
    });
  });

  describe('POST /2fa/verify', () => {
    it('should route to challenge login when challenge is in body', async () => {
      mockAuthService.verify2fa.mockResolvedValue({ access_token: 'tok' });
      const req = { headers: {}, socket: {} } as unknown as Request;

      await controller.verify2fa({ code: '123456', challenge: 'ch-tok' }, req);

      expect(mockAuthService.verify2fa).toHaveBeenCalledWith(
        { code: '123456', challenge: 'ch-tok' },
      );
    });

    it('should route to setup confirmation with userId when Bearer present', async () => {
      mockAuthService.verify2fa.mockResolvedValue({ success: true });
      const req = {
        headers: { authorization: 'Bearer valid-token' },
        user: { sub: 'user-1', role: 'OWNER', tenantId: 't-1', type: 'access' },
      } as unknown as Request;

      await controller.verify2fa({ code: '123456' }, req);

      expect(mockAuthService.verify2fa).toHaveBeenCalledWith({ code: '123456' }, 'user-1');
    });

    it('should throw UnauthorizedException when no challenge and no authenticated user', async () => {
      const req = { headers: {}, socket: {} } as unknown as Request;

      await expect(controller.verify2fa({ code: '123456' }, req)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
