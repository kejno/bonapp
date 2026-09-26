import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, PaymentStatus, TableStatus } from '@prisma/client';
import { TenantContextService } from '../tenant/tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { MenuGateway } from '../menu/menu.gateway';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly menuGateway: MenuGateway,
  ) {}

  async findAll() {
    const tenantId = this.tenantContext.getTenantId();
    return this.prisma.db.order.findMany({ where: { tenantId } });
  }

  async findOne(id: string) {
    const tenantId = this.tenantContext.getTenantId();
    const order = await this.prisma.db.order.findFirst({ where: { id }, include: { items: true, payments: true } });
    if (!order || order.tenantId !== tenantId) {
      throw new ForbiddenException();
    }
    return order;
  }

  async findActive() {
    const tenantId = this.tenantContext.getTenantId();
    return this.prisma.db.order.findMany({
      where: { tenantId, status: { in: [OrderStatus.NEW, OrderStatus.COOKING, OrderStatus.READY] } },
      include: { table: true, items: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async changeStatus(id: string, status: OrderStatus) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new ForbiddenException();
    if (status === OrderStatus.PAID) throw new BadRequestException('PAID requires a successful payment');
    return this.prisma.transactionForTenant(tenantId, async (tx) => {
      const order = await tx.order.findFirst({ where: { id, tenantId } });
      if (!order) throw new NotFoundException(`Order ${id} not found`);
      const transitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
        [OrderStatus.NEW]: [OrderStatus.COOKING, OrderStatus.CANCELLED],
        [OrderStatus.COOKING]: [OrderStatus.READY, OrderStatus.CANCELLED],
        [OrderStatus.READY]: [OrderStatus.SERVED, OrderStatus.CANCELLED],
        [OrderStatus.SERVED]: [OrderStatus.CANCELLED],
      };
      if (!transitions[order.status]?.includes(status)) {
        throw new BadRequestException(`Transition ${order.status} → ${status} is not allowed`);
      }
      const updated = await tx.order.update({ where: { id_tenantId: { id, tenantId } }, data: { status } });
      if (status === OrderStatus.SERVED) {
        await tx.table.update({ where: { id_tenantId: { id: order.tableId, tenantId } }, data: { status: TableStatus.OCCUPIED } });
      } else if (status === OrderStatus.CANCELLED) {
        await tx.table.update({ where: { id_tenantId: { id: order.tableId, tenantId } }, data: { status: TableStatus.AVAILABLE } });
      }
      this.menuGateway.emitOrderStatusChanged(tenantId, id, status);
      return updated;
    });
  }

  async create(tableId: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new ForbiddenException();

    return this.prisma.transactionForTenant(tenantId, async (tx) => {
      const table = await tx.table.findFirst({ where: { id: tableId } });
      if (!table) throw new NotFoundException(`Table ${tableId} not found`);
      const reservation = await tx.table.updateMany({
        where: { id: tableId, tenantId, status: TableStatus.AVAILABLE },
        data: { status: TableStatus.OCCUPIED },
      });
      if (reservation.count !== 1) {
        throw new ConflictException('Table is not available');
      }
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      const timeZone = tenant?.timezone ?? 'Europe/Minsk';
      const now = new Date();
      const [start, end, businessDate] = businessDayBounds(now, timeZone);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${businessDate}))`;
      const dailyOrderNumber = (await tx.order.count({
        where: { tenantId, createdAt: { gte: start, lt: end } },
      })) + 1;
      const order = await tx.order.create({
        data: { tenantId, tableId, dailyOrderNumber },
      });
      return order;
    });
  }

  async pay(id: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new ForbiddenException();

    return this.prisma.transactionForTenant(tenantId, async (tx) => {
      const order = await tx.order.findFirst({ where: { id, tenantId } });
      if (!order) throw new NotFoundException(`Order ${id} not found`);
      if (order.isPaid || order.status === OrderStatus.PAID) {
        throw new ConflictException('Order is already paid');
      }
      const payment = await tx.payment.findFirst({
        where: { orderId: id, tenantId, status: PaymentStatus.SUCCEEDED },
      });
      if (!payment) throw new ConflictException('A successful payment is required');

      const paidOrder = await tx.order.update({
        where: { id_tenantId: { id, tenantId } },
        data: { isPaid: true, status: OrderStatus.PAID, paidAt: new Date() },
      });
      await tx.table.update({
        where: { id_tenantId: { id: order.tableId, tenantId } },
        data: { status: TableStatus.AVAILABLE },
      });
      this.menuGateway.emitOrderStatusChanged(tenantId, id, OrderStatus.PAID);
      return paidOrder;
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
  const nextParts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(nextDate);
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
