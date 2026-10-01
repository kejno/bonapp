import { BadRequestException, Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Injectable, Param, Patch, UseGuards } from '@nestjs/common';
import { PlanType, UserRole } from '@prisma/client';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { SuperadminService } from './superadmin.service';

interface SuperadminRequest extends Request { user?: { role?: UserRole; userId?: string; tenantId?: string } }

@Injectable()
export class SuperadminOnlyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<SuperadminRequest>();
    const { userId, tenantId } = request.user ?? {};
    if (request.user?.role !== UserRole.SUPER_ADMIN || !userId || !tenantId) throw new ForbiddenException();
    const user = await this.prisma.forTenant(tenantId).user.findFirst({ where: { id: userId, role: UserRole.SUPER_ADMIN, isActive: true, isBlocked: false }, select: { id: true } });
    if (!user) throw new ForbiddenException();
    return true;
  }
}

@Controller('superadmin')
@SkipTenantGuard()
@UseGuards(AuthGuard, SuperadminOnlyGuard)
export class SuperadminController {
  constructor(private readonly service: SuperadminService) {}

  @Get('overview') overview() { return this.service.overview(); }

  @Patch('tenants/:id/plan') updatePlan(@Param('id') id: string, @Body() body: { plan?: unknown }) {
    if (typeof body?.plan !== 'string') throw new BadRequestException('Некорректный тарифный план');
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
