import { ConflictException, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, TableStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WelcomeService {
  constructor(private readonly prisma: PrismaService) {}

  async getReadiness(tenantId: string) {
    const db = this.prisma.forTenant(tenantId);
    const [menuCount, tableCount, orderCount, activeShift] = await Promise.all([
      db.menuItem.count({ where: { isActive: true, isInStopList: false, category: { is: { isActive: true } } } }),
      db.table.count(),
      db.order.count(),
      db.shift.findFirst({ where: { closedAt: null }, select: { id: true } }),
    ]);
    return {
      menuReady: menuCount > 0,
      tablesReady: tableCount > 0,
      // Provider credentials are not represented by the current schema.
      paymentsReady: false,
      hasOrders: orderCount > 0,
      hasActiveShift: Boolean(activeShift),
      canSimulateOrder: menuCount > 0 && tableCount > 0,
    };
  }

  async openShift(tenantId: string, userId: string) {
    const db = this.prisma.forTenant(tenantId);
    const existing = await db.shift.findFirst({ where: { closedAt: null } });
    if (existing) return existing;
    try {
      return await db.shift.create({ data: { id: randomUUID(), tenantId, openedById: userId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A shift is already open');
      }
      throw error;
    }
  }

  async simulateTestOrder(tenantId: string) {
    return this.prisma.transactionForTenant(tenantId, async (tx) => {
      const existing = await tx.order.findFirst({
        where: { tenantId, isTest: true, status: { notIn: [OrderStatus.PAID, OrderStatus.CANCELLED] } },
      });
      if (existing) return existing;

      const [table, item, tenant] = await Promise.all([
        tx.table.findFirst({ where: { tenantId }, orderBy: [{ createdAt: 'asc' }, { tableNumber: 'asc' }] }),
        tx.menuItem.findFirst({
          where: { tenantId, isActive: true, isInStopList: false, category: { is: { isActive: true } } },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        }),
        tx.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } }),
      ]);
      if (!table || !item) throw new ConflictException('Для тестового заказа добавьте стол и активную позицию меню');
      const reserved = await tx.table.updateMany({ where: { id: table.id, tenantId, status: TableStatus.AVAILABLE }, data: { status: TableStatus.OCCUPIED } });
      if (reserved.count !== 1) throw new ConflictException('Первый стол занят; освободите его и повторите попытку');

      const timeZone = tenant?.timezone ?? 'Europe/Minsk';
      const [start, end, businessDate] = businessDayBounds(new Date(), timeZone);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${businessDate}))`;
      const dailyOrderNumber = (await tx.order.count({ where: { tenantId, createdAt: { gte: start, lt: end } } })) + 1;
      const order = await tx.order.create({
        data: {
          tenantId, tableId: table.id, dailyOrderNumber, isTest: true,
          totalAmountByn: item.priceByn,
          items: { create: { itemId: item.id, quantity: 1, unitPriceByn: item.priceByn, selectedModifiers: Prisma.JsonNull, status: 'NEW', kitchenDepartment: item.kitchenDepartment ?? 'MAIN' } },
        },
      });
      return order;
    });
  }
}

function businessDayBounds(now: Date, timeZone: string): [Date, Date, string] {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const date = `${values['year']}-${values['month']}-${values['day']}`;
  const start = zonedMidnight(date, timeZone);
  const nextDate = new Date(Date.UTC(Number(values['year']), Number(values['month']) - 1, Number(values['day']) + 1));
  const nextParts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(nextDate);
  const nextValues = Object.fromEntries(nextParts.map(({ type, value }) => [type, value]));
  const next = `${nextValues['year']}-${nextValues['month']}-${nextValues['day']}`;
  return [start, zonedMidnight(next, timeZone), date];
}

function zonedMidnight(date: string, timeZone: string): Date {
  const target = Date.parse(`${date}T00:00:00Z`);
  let result = target;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(result));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const represented = Date.UTC(Number(values['year']), Number(values['month']) - 1, Number(values['day']), Number(values['hour']), Number(values['minute']), Number(values['second']));
    result += target - represented;
  }
  return new Date(result);
}
