import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';

const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @SkipTenantGuard()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
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
