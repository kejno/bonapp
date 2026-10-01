import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { tenantDayBounds } from '../analytics/analytics-time';
import { Prisma } from '@prisma/client';

export type SubscriptionPlan = 'TRIAL' | 'STANDARD' | 'PRO' | 'ENTERPRISE';
export interface TenantUpdate {
  subscription_plan?: SubscriptionPlan;
  trial_ends_at?: string;
  is_active?: boolean;
}

@Injectable()
export class SuperadminService {
  private readonly prices: Record<SubscriptionPlan, number>;

  constructor(private readonly prisma: PrismaService, config: ConfigService) {
    this.prices = {
      TRIAL: 0,
      STANDARD: this.requiredPrice(config, 'PLAN_STANDARD_PRICE_BYN'),
      PRO: this.requiredPrice(config, 'PLAN_PRO_PRICE_BYN'),
      ENTERPRISE: this.requiredPrice(config, 'PLAN_ENTERPRISE_PRICE_BYN'),
    };
  }

  async listTenants() {
    return this.prisma.superadminTransaction(async (tx) => {
      const tenants = await tx.tenant.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, slug: true, subscriptionPlan: true, isActive: true, trialEndsAt: true },
      });
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const orderCounts = await tx.order.groupBy({
        by: ['tenantId'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      });
      const countsByTenant = new Map(orderCounts.map((row) => [row.tenantId, row._count._all]));
      return tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.subscriptionPlan,
        is_active: tenant.isActive,
        trial_ends_at: tenant.trialEndsAt,
        order_count_30d: countsByTenant.get(tenant.id) ?? 0,
        monthly_revenue_byn: tenant.isActive ? this.prices[tenant.subscriptionPlan as SubscriptionPlan] ?? 0 : 0,
      }));
    });
  }

  async updateTenant(id: string, update: TenantUpdate) {
    return this.prisma.superadminTransaction(async (tx) => {
      const existing = await tx.tenant.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundException('Tenant not found');
      const data: Prisma.TenantUpdateInput = {};
      if (update.subscription_plan !== undefined) data.subscriptionPlan = update.subscription_plan;
      if (update.trial_ends_at !== undefined) data.trialEndsAt = new Date(update.trial_ends_at);
      if (update.is_active !== undefined) data.isActive = update.is_active;
      return tx.tenant.update({
        where: { id }, data,
        select: { id: true, name: true, slug: true, subscriptionPlan: true, isActive: true, trialEndsAt: true },
      });
    });
  }

  async platformStats() {
    const { start, end } = tenantDayBounds('Europe/Minsk');
    return this.prisma.superadminTransaction(async (tx) => {
      const [tenants, totalTenants, activeTenants, qrOrders] = await Promise.all([
        tx.tenant.findMany({ where: { isActive: true }, select: { subscriptionPlan: true } }),
        tx.tenant.count(),
        tx.tenant.count({ where: { isActive: true } }),
        tx.order.count({ where: { guestSessionId: { not: null }, createdAt: { gte: start, lt: end } } }),
      ]);
      const mrr = tenants.reduce((total, tenant) => tenant.subscriptionPlan === 'TRIAL' ? total : total + (this.prices[tenant.subscriptionPlan as SubscriptionPlan] ?? 0), 0);
      return { mrr_byn: mrr, total_tenants: totalTenants, active_tenants: activeTenants, qr_orders_today: qrOrders };
    });
  }

  private requiredPrice(config: ConfigService, key: string): number {
    const raw = config.get<string>(key);
    const value = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new Error(`${key} must be configured as a non-negative number`);
    return value;
  }
}
