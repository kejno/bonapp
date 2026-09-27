import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { SkipTenantGuard } from './tenant.constants';

@Controller('guest/tenant/config')
@SkipTenantGuard()
export class GuestTenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  getConfig(@Query('tenantId') tenantId?: string) {
    const id = tenantId?.trim();
    if (!id) throw new BadRequestException('tenantId is required');
    return this.tenantService.getGuestConfig(id);
  }
}
