import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tenantDayBounds } from './analytics-time';

const paidStatuses = [OrderStatus.PAID];
const completedPayments = [PaymentStatus.COMPLETED, PaymentStatus.SUCCEEDED];

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async dailySummary(tenantId: string) {
    const db = this.prisma.db;
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true, posType: true } });
    const { start, end } = tenantDayBounds(tenant?.timezone ?? 'Europe/Minsk');
    const [orders, occupied, totalTables, soldItems] = await Promise.all([
      db.order.findMany({ where: { tenantId, status: { in: paidStatuses }, paidAt: { gte: start, lt: end }, isTest: false }, select: { totalAmountByn: true } }),
      db.table.count({ where: { tenantId, status: { in: ['OCCUPIED', 'BILL_REQUESTED'] } } }),
      db.table.count({ where: { tenantId, status: { not: 'CLOSED' } } }),
      db.orderItem.findMany({ where: { order: { tenantId, status: { in: paidStatuses }, paidAt: { gte: start, lt: end }, isTest: false } }, select: { itemId: true, quantity: true, unitPriceByn: true } }),
    ]);
    const sales = new Map<string, { quantity: number; revenueByn: number }>();
    for (const item of soldItems) {
      const total = sales.get(item.itemId) ?? { quantity: 0, revenueByn: 0 };
      total.quantity += item.quantity;
      total.revenueByn += Number(item.unitPriceByn) * item.quantity;
      sales.set(item.itemId, total);
    }
    const itemIds = [...sales.keys()];
    const names = await db.menuItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true } });
    const nameById = new Map(names.map(({ id, name }) => [id, name]));
    const topItems = [...sales].map(([itemId, values]) => ({ itemId, ...values })).sort((a, b) => b.quantity - a.quantity || b.revenueByn - a.revenueByn || (nameById.get(a.itemId) ?? '').localeCompare(nameById.get(b.itemId) ?? '', 'ru')).slice(0, 5);
    const revenue = orders.reduce((sum, order) => sum + Number(order.totalAmountByn), 0);
    return {
      revenueByn: revenue,
      averageCheckByn: orders.length ? revenue / orders.length : 0,
      ordersCount: orders.length,
      tablesOccupancyPercent: totalTables ? Math.round(occupied / totalTables * 100) : 0,
      pos: { configured: Boolean(tenant?.posType), pingMs: null as number | null },
      topDishes: topItems.map(({ itemId, quantity }) => ({ name: nameById.get(itemId) ?? 'Удалённое блюдо', quantity })),
    };
  }

  async revenue(tenantId: string, from?: string, to?: string, granularity = 'hour') {
    if (!['hour', 'day'].includes(granularity)) throw new BadRequestException('granularity must be hour or day');
    const tenant = await this.prisma.db.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
    const { start: todayStart, end: todayEnd } = tenantDayBounds(tenant?.timezone ?? 'Europe/Minsk');
    const start = from ? new Date(from) : todayStart;
    const end = to ? new Date(to) : todayEnd;
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) throw new BadRequestException('from and to must define a valid range');
    const rows = await this.prisma.db.order.findMany({ where: { tenantId, status: { in: paidStatuses }, paidAt: { gte: start, lt: end }, isTest: false }, select: { paidAt: true, totalAmountByn: true }, orderBy: { paidAt: 'asc' } });
    const totals = new Map<string, number>();
    for (const row of rows) {
      if (!row.paidAt) continue;
      const date = new Intl.DateTimeFormat('sv-SE', { timeZone: tenant?.timezone ?? 'Europe/Minsk', year: 'numeric', month: '2-digit', day: '2-digit' }).format(row.paidAt);
      const hour = new Intl.DateTimeFormat('en-GB', { timeZone: tenant?.timezone ?? 'Europe/Minsk', hour: '2-digit', hourCycle: 'h23' }).format(row.paidAt);
      const key = granularity === 'hour' ? `${date}T${hour}:00` : date;
      totals.set(key, (totals.get(key) ?? 0) + Number(row.totalAmountByn));
    }
    return [...totals].map(([period, revenueByn]) => ({ period, revenueByn }));
  }

  async paymentsSplit(tenantId: string) {
    const { start, end } = await this.dayBounds(tenantId);
    const rows = await this.prisma.db.payment.groupBy({ by: ['method'], where: { tenantId, status: { in: completedPayments }, createdAt: { gte: start, lt: end }, order: { isTest: false } }, _sum: { amountByn: true }, _count: { _all: true } });
    const byMethod = new Map(rows.map(({ method, _sum, _count }) => [method, { amountByn: Number(_sum.amountByn ?? 0), transactionsCount: _count._all }]));
    return ['OPLATI_QR', 'ERIP_EPOS', 'BANK_CARD', 'CASH_TO_WAITER'].map((method) => ({ method, ...(byMethod.get(method as (typeof rows)[number]['method']) ?? { amountByn: 0, transactionsCount: 0 }) }));
  }

  async tips(tenantId: string) {
    const { start, end } = await this.dayBounds(tenantId);
    const payments = await this.prisma.db.payment.findMany({ where: { tenantId, status: { in: completedPayments }, createdAt: { gte: start, lt: end }, order: { isTest: false } }, select: { tipsAmountByn: true, order: { select: { assignedWaiterId: true, assignedWaiter: { select: { fullName: true } } } } } });
    const totals = new Map<string, { waiterName: string; tipsByn: number; transactionsCount: number }>();
    for (const payment of payments) {
      const id = payment.order.assignedWaiterId ?? 'unassigned';
      const row = totals.get(id) ?? { waiterName: payment.order.assignedWaiter?.fullName ?? 'Не назначен', tipsByn: 0, transactionsCount: 0 };
      row.tipsByn += Number(payment.tipsAmountByn);
      row.transactionsCount += 1;
      totals.set(id, row);
    }
    return [...totals.values()].sort((a, b) => b.tipsByn - a.tipsByn);
  }

  private async dayBounds(tenantId: string) {
    const tenant = await this.prisma.db.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
    return tenantDayBounds(tenant?.timezone ?? 'Europe/Minsk');
  }
}
