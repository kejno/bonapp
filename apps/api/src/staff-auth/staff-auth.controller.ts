import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { StaffAuthService } from './staff-auth.service';
import { JwtAuthGuard, StaffRequest } from './jwt-auth.guard';
import {
  ChangePasswordDto,
  LoginDto,
  LoginResponse,
  LogoutDto,
  RefreshDto,
  TokenPair,
} from './staff-auth.dto';

interface LoginBody extends LoginDto {
  tenantId: string;
}

@Controller('auth')
export class StaffAuthController {
  constructor(private readonly staffAuthService: StaffAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @SkipTenantGuard()
  async login(@Body() body: LoginBody, @Req() req: Request): Promise<LoginResponse> {
    const { tenantId, email, password } = body;
    if (!tenantId || !email || !password) {
      throw new BadRequestException('tenantId, email and password are required');
    }
    const ip = req.ip ?? '0.0.0.0';
    return this.staffAuthService.login(tenantId, email, password, ip);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @SkipTenantGuard()
  async refresh(@Body() body: RefreshDto): Promise<TokenPair> {
    if (!body.refreshToken) {
      throw new BadRequestException('refreshToken is required');
    }
    return this.staffAuthService.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SkipTenantGuard()
  async logout(@Body() body: LogoutDto): Promise<void> {
    if (!body.refreshToken) {
      throw new BadRequestException('refreshToken is required');
    }
    return this.staffAuthService.logout(body.refreshToken);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Body() body: ChangePasswordDto,
    @Req() req: StaffRequest,
  ): Promise<void> {
    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword) {
      throw new BadRequestException(
        'currentPassword and newPassword are required',
      );
    }
    const { userId, tenantId } = req.staffUser!;
    return this.staffAuthService.changePassword(
      tenantId,
      userId,
      currentPassword,
      newPassword,
    );
  }
}
