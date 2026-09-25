import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

interface AuthenticatedRequest extends Request {
  user?: { tenantId: string; userId?: string; role?: string };
}

@Controller('auth')
@SkipTenantGuard()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('pin-login')
  async pinLogin(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) response?: Response,
  ): Promise<{ accessToken: string }> {
    if (!isValidPinLoginBody(body)) {
      throw new BadRequestException('tenantSlug and pin (4 digits) are required');
    }
    const ip = req.ip ?? '0.0.0.0';
    try {
      return await this.authService.pinLogin(body.tenantSlug, body.pin, ip);
    } catch (error) {
      this.setRetryAfterHeader(error, response);
      throw error;
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Req() req?: Request,
    @Res({ passthrough: true }) response?: Response,
  ): Promise<{ accessToken: string; user: { id: string; email: string; role: string; tenantId: string; fullName: string } } | { challenge: string }> {
    try {
      let result: Awaited<ReturnType<AuthService['login']>>;
      if (isValidLoginBody(body)) {
        result = await this.authService.login(body.tenantSlug, body.email, body.password, req?.ip ?? '0.0.0.0');
      } else if (isValidLegacyLoginBody(body)) {
        result = await this.authService.loginLegacy(body.login, body.password, req?.ip ?? '0.0.0.0');
      } else {
        throw new BadRequestException('login/password or tenantSlug/email/password are required');
      }
      if ('refreshToken' in result) {
        response?.cookie('refreshToken', result.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: REFRESH_COOKIE_MAX_AGE,
          path: '/api/v1/auth',
        });
        return { accessToken: result.accessToken, user: result.user };
      }
      return result;
    } catch (error) {
      this.setRetryAfterHeader(error, response);
      throw error;
    }
  }

  @Post('2fa/setup')
  @UseGuards(AuthGuard)
  async setup2fa(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ secret: string; otpAuthUri: string; setupChallenge: string }> {
    const userId = req.user?.userId;
    const tenantId = req.user?.tenantId;
    if (!userId || !tenantId) {
      throw new BadRequestException('Authentication context missing');
    }
    return this.authService.setup2fa(userId, tenantId);
  }

  @Post('2fa/verify')
  async verify2fa(
    @Body() body: unknown,
    @Res({ passthrough: true }) response?: Response,
  ): Promise<{ accessToken: string; user: { id: string; email: string; role: string; tenantId: string; fullName: string } } | { totpEnabled: boolean }> {
    if (!isValidVerify2faBody(body)) {
      throw new BadRequestException('challenge and code (6 digits) are required');
    }
    try {
      const result = await this.authService.verify2fa(body.challenge, body.code);
      if ('refreshToken' in result) {
        response?.cookie('refreshToken', result.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: REFRESH_COOKIE_MAX_AGE,
          path: '/api/v1/auth',
        });
        return { accessToken: result.accessToken, user: result.user };
      }
      return result;
    } catch (error) {
      this.setRetryAfterHeader(error, response);
      throw error;
    }
  }

  private setRetryAfterHeader(error: unknown, response?: Response): void {
    if (!(error instanceof HttpException) || !response) return;
    const exceptionResponse = error.getResponse();
    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'retryAfter' in exceptionResponse &&
      typeof exceptionResponse.retryAfter === 'number'
    ) {
      response.setHeader('Retry-After', String(exceptionResponse.retryAfter));
    }
  }
}

function isValidPinLoginBody(body: unknown): body is { tenantSlug: string; pin: string } {
  if (typeof body !== 'object' || body === null) return false;
  const { tenantSlug, pin } = body as Record<string, unknown>;
  return (
    typeof tenantSlug === 'string' && tenantSlug.trim().length > 0 &&
    typeof pin === 'string' && /^\d{4}$/.test(pin)
  );
}

function isValidLoginBody(
  body: unknown,
): body is { tenantSlug: string; email: string; password: string } {
  if (typeof body !== 'object' || body === null) return false;
  const { tenantSlug, email, password } = body as Record<string, unknown>;
  return (
    typeof tenantSlug === 'string' && tenantSlug.trim().length > 0 &&
    typeof email === 'string' && email.trim().length > 0 &&
    typeof password === 'string' && password.length > 0
  );
}

function isValidLegacyLoginBody(body: unknown): body is { login: string; password: string } {
  if (typeof body !== 'object' || body === null) return false;
  const { login, password } = body as Record<string, unknown>;
  return typeof login === 'string' && login.trim().length > 0 && typeof password === 'string' && password.length > 0;
}

function isValidVerify2faBody(body: unknown): body is { challenge: string; code: string } {
  if (typeof body !== 'object' || body === null) return false;
  const { challenge, code } = body as Record<string, unknown>;
  return (
    typeof challenge === 'string' && challenge.trim().length > 0 &&
    typeof code === 'string' && /^\d{6}$/.test(code)
  );
}
