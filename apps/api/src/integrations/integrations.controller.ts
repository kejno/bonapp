import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { AuthGuard } from '../auth/auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import type { TenantRequest } from '../auth/tenant-context.guard';
import { IntegrationsService } from './integrations.service';

@Controller('admin')
@ApiTags('Администрирование')
@ApiBearerAuth()
@UseGuards(AuthGuard, TenantContextGuard, AdminRoleGuard)
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @ApiOperation({ summary: 'Получить admin integrations/status' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Get('integrations/status')
  getStatus(@Req() req: TenantRequest) {
    return this.integrations.getStatus(req.user!.tenantId!);
  }

  @ApiOperation({ summary: 'Обновить admin tenant/settings' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Put('tenant/settings')
  updateSettings(@Req() req: TenantRequest, @Body() body: unknown) {
    if (!this.integrations.isValidSettingsUpdate(body)) {
      throw new BadRequestException('provider and settings are required');
    }
    return this.integrations.updateSettings(
      req.user!.tenantId!,
      body.provider,
      body.settings,
    );
  }

  @ApiOperation({ summary: 'Создать или выполнить admin integrations/:provider/sync' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Post('integrations/:provider/sync')
  @HttpCode(202)
  syncMenu(@Req() req: TenantRequest, @Param('provider') provider: string) {
    if (provider !== 'iiko' && provider !== 'r_keeper') {
      throw new BadRequestException('Unknown POS provider');
    }
    return this.integrations.syncMenu(req.user!.tenantId!, provider);
  }
}
