import { Body, Controller, Get, Post } from '@nestjs/common';
import { TenantId } from '../common/tenant-id.decorator';
import { ShiftsService } from './shifts.service';

@Controller('api/v1/admin/shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get('current')
  current(@TenantId() tenantId: string) {
    return this.shiftsService.current(tenantId);
  }

  @Post('open')
  open(@TenantId() tenantId: string, @Body('cashier_id') cashierId: string) {
    return this.shiftsService.open(tenantId, cashierId);
  }

  @Post('close')
  close(@TenantId() tenantId: string) {
    return this.shiftsService.close(tenantId);
  }
}
