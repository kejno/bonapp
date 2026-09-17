import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionPlan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlanPrices } from '../config/plan-prices.config';
import { TenantListItemDto } from './dto/tenant-list-item.dto';
import { PatchTenantDto } from './dto/patch-tenant.dto';
import { PlatformStatsDto } from './dto/platform-stats.dto';

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getTenants(): Promise<TenantListItemDto[]> {
    const prices = this.configService.get<PlanPrices>('planPrices')!;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const tenants = await this.prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        subscriptionPlan: true,
        isActive: true,
        trialEndsAt: true,
        _count: { select: { orders: { where: { createdAt: { gte: thirtyDaysAgo } } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.subscriptionPlan,
      isActive: t.isActive,
      trialEndsAt: t.trialEndsAt,
      orderCount30d: t._count.orders,
      monthlyRevenueByn: this.computeMonthlyRevenue(t.subscriptionPlan, t.isActive, prices),
    }));
  }

  async patchTenant(id: string, dto: PatchTenantDto): Promise<TenantListItemDto> {
    const existing = await this.prisma.tenant.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Tenant ${id} not found`);

    const prices = this.configService.get<PlanPrices>('planPrices')!;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: {
        ...(dto.subscriptionPlan !== undefined && { subscriptionPlan: dto.subscriptionPlan }),
        ...(dto.trialEndsAt !== undefined && { trialEndsAt: new Date(dto.trialEndsAt) }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        subscriptionPlan: true,
        isActive: true,
        trialEndsAt: true,
        _count: { select: { orders: { where: { createdAt: { gte: thirtyDaysAgo } } } } },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      plan: updated.subscriptionPlan,
      isActive: updated.isActive,
      trialEndsAt: updated.trialEndsAt,
      orderCount30d: updated._count.orders,
      monthlyRevenueByn: this.computeMonthlyRevenue(updated.subscriptionPlan, updated.isActive, prices),
    };
  }

  async getPlatformStats(): Promise<PlatformStatsDto> {
    const prices = this.configService.get<PlanPrices>('planPrices')!;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [allTenants, qrOrdersToday] = await Promise.all([
      this.prisma.tenant.findMany({
        select: { subscriptionPlan: true, isActive: true },
      }),
      this.prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
    ]);

    const activeTenants = allTenants.filter((t) => t.isActive);
    const mrrByn = activeTenants
      .filter((t) => t.subscriptionPlan !== SubscriptionPlan.TRIAL)
      .reduce((sum, t) => sum + prices[t.subscriptionPlan], 0);

    return {
      mrrByn,
      totalTenants: allTenants.length,
      activeTenants: activeTenants.length,
      qrOrdersToday,
    };
  }

  private computeMonthlyRevenue(
    plan: SubscriptionPlan,
    isActive: boolean,
    prices: PlanPrices,
  ): number {
    if (!isActive || plan === SubscriptionPlan.TRIAL) return 0;
    return prices[plan];
  }
}
