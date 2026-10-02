import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { AuthGuard } from '../auth/auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import type { TenantRequest } from '../auth/tenant-context.guard';
import { WelcomeService } from './welcome.service';

@Controller('admin')
@ApiTags('Администрирование')
@ApiBearerAuth()
@UseGuards(AuthGuard, TenantContextGuard, AdminRoleGuard)
export class WelcomeController {
  constructor(private readonly welcomeService: WelcomeService) {}

  @ApiOperation({ summary: 'Получить admin readiness' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Get('readiness')
  getReadiness(@Req() req: TenantRequest) {
    return this.welcomeService.getReadiness(req.user!.tenantId!);
  }

  @ApiOperation({ summary: 'Создать или выполнить admin welcome/shifts/open' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Post('welcome/shifts/open')
  openShift(@Req() req: TenantRequest) {
    if (!req.user!.userId) throw new UnauthorizedException('Authenticated user id is required');
    return this.welcomeService.openShift(req.user!.tenantId!, req.user!.userId);
  }
}
