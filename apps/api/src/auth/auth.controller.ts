import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

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
  ): Promise<{ accessToken: string }> {
    if (!isValidPinLoginBody(body)) {
      throw new BadRequestException('tenantSlug and pin (4 digits) are required');
    }
    const ip = req.ip ?? '0.0.0.0';
    return this.authService.pinLogin(body.tenantSlug, body.pin, ip);
  }

  @Post('login')
  async login(
    @Body() body: unknown,
  ): Promise<{ accessToken: string } | { challenge: string }> {
    if (!isValidLoginBody(body)) {
      throw new BadRequestException('tenantSlug, email, and password are required');
    }
    return this.authService.login(body.tenantSlug, body.email, body.password);
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
  ): Promise<{ accessToken: string } | { totpEnabled: boolean }> {
    if (!isValidVerify2faBody(body)) {
      throw new BadRequestException('challenge and code (6 digits) are required');
    }
    return this.authService.verify2fa(body.challenge, body.code);
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

function isValidVerify2faBody(body: unknown): body is { challenge: string; code: string } {
  if (typeof body !== 'object' || body === null) return false;
  const { challenge, code } = body as Record<string, unknown>;
  return (
    typeof challenge === 'string' && challenge.trim().length > 0 &&
    typeof code === 'string' && /^\d{6}$/.test(code)
  );
}
