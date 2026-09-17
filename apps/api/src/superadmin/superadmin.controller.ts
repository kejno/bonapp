import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { PatchTenantDto } from './dto/patch-tenant.dto';
import { PlatformStatsDto } from './dto/platform-stats.dto';
import { TenantListItemDto } from './dto/tenant-list-item.dto';
import { SuperAdminService } from './superadmin.service';

@UseGuards(SuperAdminGuard)
@Controller('api/v1/superadmin')
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get('tenants')
  getTenants(): Promise<TenantListItemDto[]> {
    return this.superAdminService.getTenants();
  }

  @Patch('tenants/:id')
  patchTenant(
    @Param('id') id: string,
    @Body() dto: PatchTenantDto,
  ): Promise<TenantListItemDto> {
    return this.superAdminService.patchTenant(id, dto);
  }

  @Get('platform/stats')
  getPlatformStats(): Promise<PlatformStatsDto> {
    return this.superAdminService.getPlatformStats();
  }
}
