import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BadRequestException, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { OnboardingService } from './onboarding.service';
import { IikoService } from '../integrations/iiko/iiko.service';

@Controller('admin/pos')
@ApiTags('Администрирование')
@ApiBearerAuth()
@UseGuards(AuthGuard)
export class PosSyncController {
  constructor(private readonly onboarding: OnboardingService, private readonly iiko: IikoService) {}

  @ApiOperation({ summary: 'Создать или выполнить admin/pos sync-menu' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Post('sync-menu')
  @UseGuards(TenantContextGuard, AdminRoleGuard)
  async syncMenu() {
    try {
      return await this.iiko.enqueueSync();
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      return this.onboarding.startImport();
    }
  }
}
