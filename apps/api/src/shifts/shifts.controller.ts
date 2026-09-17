import { Controller, Get, Post, Param, Body, Headers } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { OpenShiftDto } from './dto/open-shift.dto';

@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get('current')
  getCurrent(@Headers('x-tenant-id') tenantId: string) {
    return this.shiftsService.getCurrent(tenantId);
  }

  @Post('open')
  open(@Headers('x-tenant-id') tenantId: string, @Body() dto: OpenShiftDto) {
    return this.shiftsService.open(tenantId, dto);
  }

  @Post(':id/close')
  close(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.shiftsService.close(tenantId, id);
  }
}
