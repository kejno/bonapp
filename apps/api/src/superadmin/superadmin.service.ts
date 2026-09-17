import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PlanType,
  TenantStatus,
  TenantSummaryDto,
  PlatformMetricsDto,
  MrrMonthlyDto,
  TenantsListDto,
} from '@bonapp/shared-types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SuperadminService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(): Promise<PlatformMetricsDto> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);

    const [mrrResult, activeTenants, ordersToday, rawPayments] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { type: 'subscription', createdAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      this.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.payment.findMany({
        where: { type: 'subscription', createdAt: { gte: twelveMonthsAgo } },
        select: { amount: true, createdAt: true },
      }),
    ]);

    return {
      mrr: mrrResult._sum.amount ?? 0,
      activeTenants,
      ordersToday,
      mrrHistory: this.buildMrrHistory(rawPayments, now),
    };
  }

  async getTenants(filters: { plan?: string; status?: string }): Promise<TenantsListDto> {
    const where: { plan?: PlanType; status?: TenantStatus } = {};
    if (filters.plan) where.plan = filters.plan as PlanType;
    if (filters.status) where.status = filters.status as TenantStatus;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const tenants = await this.prisma.tenant.findMany({ where, orderBy: { createdAt: 'desc' } });
    const tenantIds = tenants.map((t) => t.id);

    const revenues = await this.prisma.payment.groupBy({
      by: ['tenantId'],
      where: { type: 'subscription', createdAt: { gte: thirtyDaysAgo }, tenantId: { in: tenantIds } },
      _sum: { amount: true },
    });

    const revenueMap = new Map(revenues.map((r) => [r.tenantId, r._sum.amount ?? 0]));

    const data: TenantSummaryDto[] = tenants.map((t) => ({
      id: t.id,
      name: t.name,
      plan: t.plan as PlanType,
      status: t.status as TenantStatus,
      trialEndsAt: t.trialEndsAt ? t.trialEndsAt.toISOString() : null,
      revenueLastThirtyDays: revenueMap.get(t.id) ?? 0,
      createdAt: t.createdAt.toISOString(),
    }));

    return { data, total: data.length };
  }

  async changePlan(id: string, plan: PlanType): Promise<TenantSummaryDto> {
    await this.assertTenantExists(id);
    const updated = await this.prisma.tenant.update({ where: { id }, data: { plan } });
    return this.toSummary(updated, 0);
  }

  async blockTenant(id: string): Promise<TenantSummaryDto> {
    await this.assertTenantExists(id);
    const updated = await this.prisma.tenant.update({ where: { id }, data: { status: 'BLOCKED' } });
    return this.toSummary(updated, 0);
  }

  async unblockTenant(id: string): Promise<TenantSummaryDto> {
    await this.assertTenantExists(id);
    const updated = await this.prisma.tenant.update({ where: { id }, data: { status: 'ACTIVE' } });
    return this.toSummary(updated, 0);
  }

  async extendTrial(id: string): Promise<TenantSummaryDto> {
    await this.assertTenantExists(id);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id } });
    const base = tenant.trialEndsAt ?? new Date();
    const newTrialEndsAt = new Date(base);
    newTrialEndsAt.setDate(newTrialEndsAt.getDate() + 30);
    const updated = await this.prisma.tenant.update({ where: { id }, data: { trialEndsAt: newTrialEndsAt } });
    return this.toSummary(updated, 0);
  }

  private async assertTenantExists(id: string): Promise<void> {
    const count = await this.prisma.tenant.count({ where: { id } });
    if (count === 0) throw new NotFoundException(`Tenant ${id} not found`);
  }

  private toSummary(
    tenant: { id: string; name: string; plan: string; status: string; trialEndsAt: Date | null; createdAt: Date },
    revenueLastThirtyDays: number,
  ): TenantSummaryDto {
    return {
      id: tenant.id,
      name: tenant.name,
      plan: tenant.plan as PlanType,
      status: tenant.status as TenantStatus,
      trialEndsAt: tenant.trialEndsAt ? tenant.trialEndsAt.toISOString() : null,
      revenueLastThirtyDays,
      createdAt: tenant.createdAt.toISOString(),
    };
  }

  private buildMrrHistory(
    payments: Array<{ amount: number; createdAt: Date }>,
    now: Date,
  ): MrrMonthlyDto[] {
    const result: MrrMonthlyDto[] = [];
    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
      const month = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
      const mrr = payments
        .filter((p) => p.createdAt >= monthDate && p.createdAt < monthEnd)
        .reduce((sum, p) => sum + p.amount, 0);
      result.push({ month, mrr });
    }
    return result;
  }
}
