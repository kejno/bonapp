import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { TenantId } from '../common/tenant-id.decorator';
import { StaffService } from './staff.service';
import type { CreateStaffDto, UpdateStaffDto } from './staff.service';

@Controller('api/v1/admin/staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.staffService.findAll(tenantId);
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateStaffDto) {
    return this.staffService.create(tenantId, dto);
  }

  @Put(':id')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staffService.update(tenantId, id, dto);
  }

  @Delete(':id')
  deactivate(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.staffService.deactivate(tenantId, id);
  }

  @Patch(':id/reset-pin')
  resetPin(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.staffService.resetPin(tenantId, id);
  }
}
