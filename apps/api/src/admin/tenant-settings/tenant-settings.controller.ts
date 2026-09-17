import { Body, Controller, Headers, HttpCode, Put } from '@nestjs/common';
import { UpdateTenantSettingsDto } from '@bonapp/shared-types';
import { TenantSettingsService } from './tenant-settings.service';

@Controller('api/v1/admin/tenant')
export class TenantSettingsController {
  constructor(private readonly tenantSettingsService: TenantSettingsService) {}

  @Put('settings')
  @HttpCode(200)
  async updateSettings(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: UpdateTenantSettingsDto,
  ): Promise<void> {
    await this.tenantSettingsService.updateSettings(tenantId, dto);
  }
}
