import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, PaymentType, PlanType, TenantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tenantLocalDate } from '../orders/daily-order-number';
import { MenuGateway } from '../menu/menu.gateway';

const paidStatuses = [PaymentStatus.SUCCEEDED, PaymentStatus.COMPLETED];

@Injectable()
export class SuperadminService {
  constructor(private readonly prisma: PrismaService, private readonly menuGateway: MenuGateway) {}

  async overview() {
    const now = new Date();
    const [year, month, day] = tenantLocalDate('Europe/Minsk', now).split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, day) - 3 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return this.prisma.superadminTransaction(async (db) => {
      const [tenants, qrOrders, payments] = await Promise.all([
        db.tenant.findMany({ select: { id: true, name: true, plan: true, status: true, trialEndsAt: true, isActive: true } }),
        db.order.count({ where: { createdAt: { gte: start, lt: end }, guestSessionId: { not: null }, isTest: false } }),
        db.payment.findMany({ where: { type: PaymentType.SUBSCRIPTION, status: { in: paidStatuses }, createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) } }, select: { amountByn: true, tenantId: true, createdAt: true } }),
      ]);
      const recent = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const payments30 = await db.payment.groupBy({ by: ['tenantId'], where: { type: PaymentType.SUBSCRIPTION, status: { in: paidStatuses }, createdAt: { gte: recent, lte: now } }, _sum: { amountByn: true } });
      const revenueByTenant = new Map(payments30.map((row) => [row.tenantId, Number(row._sum.amountByn ?? 0)]));
      const activeTenantIds = new Set(tenants.filter((tenant) => tenant.status === TenantStatus.ACTIVE && tenant.isActive).map((tenant) => tenant.id));
      const monthly = Array.from({ length: 12 }, (_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1);
        const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
        return { month: date.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }), subscriptionRevenueByn: payments.filter((payment) => activeTenantIds.has(payment.tenantId) && payment.createdAt >= date && payment.createdAt < next).reduce((sum, payment) => sum + Number(payment.amountByn), 0) };
      });
      return {
        metrics: { subscriptionRevenueByn: payments.filter((payment) => activeTenantIds.has(payment.tenantId) && payment.createdAt >= new Date(now.getFullYear(), now.getMonth(), 1)).reduce((sum, payment) => sum + Number(payment.amountByn), 0), activeRestaurants: activeTenantIds.size, qrOrdersToday: qrOrders },
        growth: monthly,
        tenants: tenants.map((tenant) => ({ ...tenant, revenue30dByn: revenueByTenant.get(tenant.id) ?? 0 })),
      };
    });
  }

  async platformStats() {
    const now = new Date();
    const [year, month, day] = tenantLocalDate('Europe/Minsk', now).split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, day) - 3 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const monthStart = new Date(Date.UTC(year, month - 1, 1) - 3 * 60 * 60 * 1000);
    const monthEnd = new Date(Date.UTC(year, month, 1) - 3 * 60 * 60 * 1000);

    return this.prisma.superadminTransaction(async (db) => {
      const [tenants, qrOrders, payments] = await Promise.all([
        db.tenant.findMany({ select: { id: true, status: true, isActive: true, plan: true } }),
        db.order.count({ where: { createdAt: { gte: start, lt: end }, guestSessionId: { not: null }, isTest: false } }),
        db.payment.findMany({
          where: {
            type: PaymentType.SUBSCRIPTION,
            status: { in: paidStatuses },
            createdAt: { gte: monthStart, lt: monthEnd },
          },
          select: { tenantId: true, amountByn: true },
        }),
      ]);
      const activePaidTenantIds = new Set(
        tenants
          .filter((tenant) => tenant.status === TenantStatus.ACTIVE && tenant.isActive && tenant.plan !== PlanType.TRIAL)
          .map((tenant) => tenant.id),
      );
      return {
        mrr_byn: payments
          .filter((payment) => activePaidTenantIds.has(payment.tenantId))
          .reduce((sum, payment) => sum + Number(payment.amountByn), 0),
        total_tenants: tenants.length,
        active_tenants: tenants.filter((tenant) => tenant.status === TenantStatus.ACTIVE && tenant.isActive).length,
        qr_orders_today: qrOrders,
      };
    });
  }

  async updatePlan(id: string, plan: PlanType) {
    if (!Object.values(PlanType).includes(plan)) throw new BadRequestException('Некорректный тарифный план');
    return this.updateTenant(id, { plan, subscriptionPlan: plan });
  }

  async setBlocked(id: string, blocked: boolean) {
    const result = await this.prisma.superadminTransaction(async (db) => {
      const current = await db.tenant.findUnique({ where: { id }, select: { status: true, statusBeforeBlock: true, isActive: true, isActiveBeforeBlock: true } });
      if (!current) throw new NotFoundException('Тенант не найден');
      const status = blocked ? TenantStatus.BLOCKED : current.statusBeforeBlock ?? TenantStatus.ACTIVE;
      const isActive = blocked ? false : current.isActiveBeforeBlock ?? true;
      const updated = await db.tenant.update({
        where: { id },
        data: {
          status,
          isActive,
          statusBeforeBlock: blocked ? (current.status === TenantStatus.BLOCKED ? current.statusBeforeBlock : current.status) : null,
          isActiveBeforeBlock: blocked ? (current.status === TenantStatus.BLOCKED ? current.isActiveBeforeBlock : current.isActive) : null,
        },
        select: { id: true, name: true, plan: true, status: true, trialEndsAt: true },
      });
      return updated;
    });
    if (blocked) this.menuGateway.disconnectTenantStaff(id);
    return result;
  }

  async extendTrial(id: string) {
    const tenant = await this.prisma.superadminTransaction((db) => db.tenant.findUnique({ where: { id }, select: { status: true, trialEndsAt: true } }));
    if (!tenant) throw new NotFoundException('Тенант не найден');
    if (tenant.status !== TenantStatus.TRIAL) throw new BadRequestException('Продлить можно только пробный период');
    const now = new Date();
    const base = tenant.trialEndsAt && tenant.trialEndsAt > now ? tenant.trialEndsAt : now;
    return this.updateTenant(id, { trialEndsAt: new Date(base.getTime() + 30 * 86400000) });
  }

  private async updateTenant(id: string, data: { plan?: PlanType; subscriptionPlan?: string; status?: TenantStatus; isActive?: boolean; trialEndsAt?: Date }) {
    try { return await this.prisma.superadminTransaction((db) => db.tenant.update({ where: { id }, data, select: { id: true, name: true, plan: true, status: true, trialEndsAt: true } })); }
    catch { throw new NotFoundException('Тенант не найден'); }
  }
}
