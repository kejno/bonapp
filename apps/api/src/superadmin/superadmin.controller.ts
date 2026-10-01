import { BadRequestException, Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { JwtAuthGuard } from '../staff-auth/jwt-auth.guard';
import { Roles } from '../staff-auth/roles.decorator';
import { RolesGuard } from '../staff-auth/roles.guard';
import { SuperadminScopeGuard } from '../staff-auth/superadmin-scope.guard';
import { SuperadminService, TenantUpdate } from './superadmin.service';

const PLANS = new Set(['TRIAL', 'STANDARD', 'PRO', 'ENTERPRISE']);

@Controller('superadmin')
@SkipTenantGuard()
@UseGuards(JwtAuthGuard, RolesGuard, SuperadminScopeGuard)
@Roles(UserRole.SUPER_ADMIN)
export class SuperadminController {
  constructor(private readonly service: SuperadminService) {}

  @Get('tenants')
  listTenants() { return this.service.listTenants(); }

  @Patch('tenants/:id')
  updateTenant(@Param('id') id: string, @Body() body: unknown) {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new BadRequestException('Request body must be an object');
    const input = body as Record<string, unknown>;
    const update: TenantUpdate = {};
    if ('subscription_plan' in input) {
      if (typeof input['subscription_plan'] !== 'string' || !PLANS.has(input['subscription_plan'])) throw new BadRequestException('Invalid subscription_plan');
      update.subscription_plan = input['subscription_plan'] as TenantUpdate['subscription_plan'];
    }
    if ('trial_ends_at' in input) {
      if (typeof input['trial_ends_at'] !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(input['trial_ends_at']) || !Number.isFinite(Date.parse(input['trial_ends_at']))) throw new BadRequestException('Invalid trial_ends_at');
      update.trial_ends_at = input['trial_ends_at'];
    }
    if ('is_active' in input) {
      if (typeof input['is_active'] !== 'boolean') throw new BadRequestException('Invalid is_active');
      update.is_active = input['is_active'];
    }
    if (Object.keys(update).length === 0) throw new BadRequestException('At least one tenant field is required');
    return this.service.updateTenant(id, update);
  }

  @Get('platform/stats')
  platformStats() { return this.service.platformStats(); }
}
