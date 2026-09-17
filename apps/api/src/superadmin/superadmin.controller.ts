import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { SuperAdminGuard } from '../guards/super-admin.guard';
import { SuperadminService } from './superadmin.service';
import { ChangePlanDto } from './dto/change-plan.dto';

@Controller('superadmin')
@UseGuards(SuperAdminGuard)
export class SuperadminController {
  constructor(private readonly superadminService: SuperadminService) {}

  @Get('metrics')
  getMetrics() {
    return this.superadminService.getMetrics();
  }

  @Get('tenants')
  getTenants(@Query('plan') plan?: string, @Query('status') status?: string) {
    return this.superadminService.getTenants({ plan, status });
  }

  @Patch('tenants/:id/plan')
  changePlan(@Param('id') id: string, @Body() dto: ChangePlanDto) {
    return this.superadminService.changePlan(id, dto.plan);
  }

  @Patch('tenants/:id/block')
  blockTenant(@Param('id') id: string) {
    return this.superadminService.blockTenant(id);
  }

  @Patch('tenants/:id/unblock')
  unblockTenant(@Param('id') id: string) {
    return this.superadminService.unblockTenant(id);
  }

  @Patch('tenants/:id/trial')
  extendTrial(@Param('id') id: string) {
    return this.superadminService.extendTrial(id);
  }
}
