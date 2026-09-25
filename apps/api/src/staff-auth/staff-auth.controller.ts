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
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { StaffAuthService } from './staff-auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { StaffRequest } from './jwt-auth.guard';
import type { TokenPair } from './staff-auth.dto';

@Controller('auth')
export class StaffAuthController {
  constructor(private readonly staffAuthService: StaffAuthService) {}

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @SkipTenantGuard()
  async refresh(@Body() body: unknown): Promise<TokenPair> {
    const refreshToken = (body as Record<string, unknown>)['refreshToken'];
    if (typeof refreshToken !== 'string' || !refreshToken) {
      throw new BadRequestException('refreshToken is required');
    }
    return this.staffAuthService.refresh(refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SkipTenantGuard()
  async logout(@Body() body: unknown): Promise<void> {
    const refreshToken = (body as Record<string, unknown>)['refreshToken'];
    if (typeof refreshToken !== 'string' || !refreshToken) {
      throw new BadRequestException('refreshToken is required');
    }
    return this.staffAuthService.logout(refreshToken);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Body() body: unknown,
    @Req() req: StaffRequest,
  ): Promise<void> {
    const b = body as Record<string, unknown>;
    const currentPassword = b['currentPassword'];
    const newPassword = b['newPassword'];
    if (
      typeof currentPassword !== 'string' ||
      !currentPassword ||
      typeof newPassword !== 'string' ||
      !newPassword
    ) {
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
