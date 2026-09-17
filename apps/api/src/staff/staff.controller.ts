import { Controller, Get, Post, Patch, Body, Param, Headers } from '@nestjs/common';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  findAll(@Headers('x-tenant-id') tenantId: string) {
    return this.staffService.findAll(tenantId);
  }

  @Post()
  create(@Headers('x-tenant-id') tenantId: string, @Body() dto: CreateStaffDto) {
    return this.staffService.create(tenantId, dto);
  }

  @Patch(':id')
  update(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staffService.update(tenantId, id, dto);
  }

  @Patch(':id/deactivate')
  deactivate(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.staffService.deactivate(tenantId, id);
  }
}
