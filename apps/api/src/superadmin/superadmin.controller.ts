import { BadRequestException, Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { PlanType, UserRole } from '@prisma/client';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { JwtAuthGuard } from '../staff-auth/jwt-auth.guard';
import { Roles } from '../staff-auth/roles.decorator';
import { RolesGuard } from '../staff-auth/roles.guard';
import { SuperadminScopeGuard } from '../staff-auth/superadmin-scope.guard';
import { SuperadminService } from './superadmin.service';

const plans = new Set(Object.values(PlanType));

@Controller('superadmin')
@SkipTenantGuard()
@UseGuards(JwtAuthGuard, RolesGuard, SuperadminScopeGuard)
@Roles(UserRole.SUPER_ADMIN)
export class SuperadminController {
  constructor(private readonly service: SuperadminService) {}

  @Get('tenants') listTenants() { return this.service.listTenants(); }

  @Get('overview') overview() { return this.service.overview(); }

  @Get('tenants') tenants() { return this.service.tenants(); }

  @Patch('tenants/:id') updateTenant(@Param('id') id: string, @Body() body: { subscription_plan?: unknown; trial_ends_at?: unknown; is_active?: unknown }) {
    const data: { plan?: PlanType; trialEndsAt?: Date; isActive?: boolean } = {};
    if (body?.subscription_plan !== undefined) {
      if (typeof body.subscription_plan !== 'string' || !plans.has(body.subscription_plan as PlanType)) throw new BadRequestException('Некорректный тарифный план');
      data.plan = body.subscription_plan as PlanType;
    }
    if (body?.trial_ends_at !== undefined) {
      if (typeof body.trial_ends_at !== 'string' || Number.isNaN(Date.parse(body.trial_ends_at))) throw new BadRequestException('Некорректная дата окончания пробного периода');
      data.trialEndsAt = new Date(body.trial_ends_at);
    }
    if (body?.is_active !== undefined) {
      if (typeof body.is_active !== 'boolean') throw new BadRequestException('Некорректное состояние активности');
      data.isActive = body.is_active;
    }
    if (Object.keys(data).length === 0) throw new BadRequestException('Укажите данные для изменения тенанта');
    return this.service.updateTenantFields(id, data);
  }
  @Get('platform/stats') platformStats() { return this.service.platformStats(); }

  @Patch('tenants/:id/plan') updatePlan(@Param('id') id: string, @Body() body: { plan?: unknown }) {
    if (typeof body?.plan !== 'string' || !plans.has(body.plan as PlanType)) throw new BadRequestException('Некорректный тарифный план');
    return this.service.updatePlan(id, body.plan as PlanType);
  }

  @Patch('tenants/:id/block') block(@Param('id') id: string, @Body() body: { blocked?: boolean }) {
    if (typeof body?.blocked !== 'boolean') throw new BadRequestException('Укажите состояние блокировки');
    return this.service.setBlocked(id, body.blocked);
  }

  @Patch('tenants/:id/trial') extendTrial(@Param('id') id: string, @Body() body: { extend_days?: number }) {
    if (body?.extend_days !== 30) throw new BadRequestException('Пробный период продлевается на 30 дней');
    return this.service.extendTrial(id);
  }
}
