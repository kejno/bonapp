import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { SkipTenantGuard } from './tenant.constants';

@Controller('guest/tenant/config')
@ApiTags('Гостевые операции')
@SkipTenantGuard()
export class GuestTenantController {
  constructor(private readonly tenantService: TenantService) {}

  @ApiOperation({ summary: 'Получить guest/tenant/config' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Get()
  getConfig(@Query('tenantId') tenantId?: string) {
    const id = tenantId?.trim();
    if (!id) throw new BadRequestException('tenantId is required');
    return this.tenantService.getGuestConfig(id);
  }
}
