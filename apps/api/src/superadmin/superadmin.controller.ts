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

  @Get('overview') overview() { return this.service.overview(); }

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
