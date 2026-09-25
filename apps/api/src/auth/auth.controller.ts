import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
import type { LoginResponse } from '../staff-auth/staff-auth.dto';

const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly staffAuthService: StaffAuthService,
  ) {}

  @Post('login')
  @SkipTenantGuard()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ): Promise<LoginResponseDto | LoginResponse> {
    if (dto.email !== undefined || dto.tenantId !== undefined) {
      if (!dto.email || !dto.tenantId) {
        throw new BadRequestException('tenantId and email are required');
      }
      return this.staffAuthService.login(
        dto.tenantId,
        dto.email,
        dto.password,
        req.ip ?? '0.0.0.0',
      );
    }

    if (!dto.login) throw new BadRequestException('login is required');
    const result = await this.authService.login(dto);

    if (result.refreshToken) {
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: REFRESH_COOKIE_MAX_AGE,
        path: '/api/v1/auth',
      });
    }

    const response: LoginResponseDto = {};
    if (result.requiresTOTP) response.requiresTOTP = true;
    if (result.accessToken) response.accessToken = result.accessToken;
    if (result.user) response.user = result.user;
    return response;
  }
}
