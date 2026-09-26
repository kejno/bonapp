import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { OrderStatus, TableStatus, UserRole } from '@prisma/client';
import { TenantContextService } from '../tenant/tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { MenuGateway } from '../menu/menu.gateway';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    @Optional() private readonly menuGateway?: MenuGateway,
  ) {}

  async findAll() {
    const tenantId = this.tenantContext.getTenantId();
    return this.prisma.db.order.findMany({ where: { tenantId } });
  }

  async findKitchenOrders(userId: string, role: UserRole) {
    const tenantId = this.tenantContext.getTenantId();
    const departments = await this.getKitchenDepartments(
      userId,
      role,
      tenantId,
    );
    const orders = await this.prisma.db.order.findMany({
      where: {
        tenantId,
        status: {
          in: [
            OrderStatus.NEW,
            OrderStatus.COOKING,
            OrderStatus.READY,
            OrderStatus.PAID,
          ],
        },
      },
      include: {
        table: { select: { tableNumber: true, label: true } },
        assignedWaiter: { select: { fullName: true } },
        items: {
          select: {
            id: true,
            itemId: true,
            quantity: true,
            status: true,
            kitchenDepartment: true,
            itemComment: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const itemIds = [
      ...new Set(
        orders.flatMap((order) => order.items.map((item) => item.itemId)),
      ),
    ];
    const menuItems = await this.prisma.db.menuItem.findMany({
      where: { id: { in: itemIds }, tenantId },
      select: { id: true, name: true },
    });
    const names = new Map(menuItems.map((item) => [item.id, item.name]));
    const visible = orders.map((order) => ({
      ...order,
      items: order.items
        .filter(
          (item) =>
            departments === null ||
            departments.includes(item.kitchenDepartment),
        )
        .map((item) => ({
          ...item,
          name: names.get(item.itemId) ?? item.itemId,
        })),
    }));
    return {
      orders: visible,
      departments: departments ?? ['HOT', 'COLD', 'BAR'],
    };
  }

  async updateKitchenStatus(
    id: string,
    status: string,
    department: string | undefined,
    userId: string,
    role: UserRole,
  ) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new ForbiddenException();
    const departments = await this.getKitchenDepartments(
      userId,
      role,
      tenantId,
    );
    if (
      departments !== null &&
      (!department || !departments.includes(department))
    ) {
      throw new ForbiddenException('Department access is required');
    }
    const progression: OrderStatus[] = [
      OrderStatus.NEW,
      OrderStatus.COOKING,
      OrderStatus.READY,
    ];
    const targetIndex = progression.indexOf(
      status as (typeof progression)[number],
    );
    if (targetIndex < 1) {
      throw new ConflictException('Invalid kitchen status transition');
    }
    return this.prisma.transactionForTenant(tenantId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id, tenantId },
        include: { items: true },
      });
      if (!order) throw new NotFoundException(`Order ${id} not found`);
      const visibleItems = order.items.filter(
        (item) => !department || item.kitchenDepartment === department,
      );
      if (!visibleItems.length && order.items.length > 0)
        throw new ForbiddenException('No items in this department');
      const currentIndex = progression.indexOf(order.status);
      if (currentIndex < 0 || targetIndex !== currentIndex + 1)
        throw new ConflictException('Order status has changed');
      if (order.items.length === 0) {
        const updated = await tx.order.update({
          where: { id_tenantId: { id, tenantId } },
          data: { status: status as OrderStatus },
        });
        this.menuGateway?.emitKitchenOrder(tenantId, 'order:updated', {
          id: updated.id,
        });
        return updated;
      }
      const currentStatus = progression[currentIndex];
      const itemIds = visibleItems
        .filter((item) => item.status === currentStatus)
        .map((item) => item.id);
      if (!itemIds.length)
        throw new ConflictException('Items are not at this status');
      await tx.orderItem.updateMany({
        where: { id: { in: itemIds }, orderId: id },
        data: { status },
      });
      const remainingItems = order.items.filter(
        (item) => !itemIds.includes(item.id),
      );
      const allProcessed = remainingItems.every(
        (item) => item.status === status,
      );
      if (allProcessed) {
        const updated = await tx.order.update({
          where: { id_tenantId: { id, tenantId } },
          data: { status: status as OrderStatus },
        });
        this.menuGateway?.emitKitchenOrder(tenantId, 'order:updated', {
          id: updated.id,
        });
        return updated;
      }
      const updated = {
        ...order,
        items: order.items.map((item) =>
          itemIds.includes(item.id) ? { ...item, status } : item,
        ),
      };
      this.menuGateway?.emitKitchenOrder(tenantId, 'order:updated', {
        id: updated.id,
      });
      return updated;
    });
  }

  private async getKitchenDepartments(
    userId: string,
    role: UserRole,
    tenantId: string | undefined,
  ): Promise<string[] | null> {
    if (role === UserRole.OWNER || role === UserRole.MANAGER) return null;
    if (!tenantId) throw new ForbiddenException();
    const user = await this.prisma.db.user.findFirst({
      where: { id: userId, tenantId },
      select: { kitchenDepartments: true },
    });
    if (!user || user.kitchenDepartments.length === 0)
      throw new ForbiddenException('No kitchen departments are assigned');
    return user.kitchenDepartments;
  }

  async findOne(id: string) {
    const tenantId = this.tenantContext.getTenantId();
    const order = await this.prisma.db.order.findFirst({ where: { id } });
    if (!order || order.tenantId !== tenantId) {
      throw new ForbiddenException();
    }
    return order;
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
      const dailyOrderNumber =
        (await tx.order.count({
          where: { tenantId, createdAt: { gte: start, lt: end } },
        })) + 1;
      const order = await tx.order.create({
        data: { tenantId, tableId, dailyOrderNumber },
      });
      this.menuGateway?.emitKitchenOrder(tenantId, 'order:created', {
        id: order.id,
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

      const paidOrder = await tx.order.update({
        where: { id_tenantId: { id, tenantId } },
        data: { isPaid: true, status: OrderStatus.PAID, paidAt: new Date() },
      });
      await tx.table.update({
        where: { id_tenantId: { id: order.tableId, tenantId } },
        data: { status: TableStatus.AVAILABLE },
      });
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
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  const date = `${values['year']}-${values['month']}-${values['day']}`;
  const start = zonedMidnight(date, timeZone);
  const nextDate = new Date(
    Date.UTC(
      Number(values['year']),
      Number(values['month']) - 1,
      Number(values['day']) + 1,
    ),
  );
  const nextParts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(nextDate);
  const nextValues = Object.fromEntries(
    nextParts.map(({ type, value }) => [type, value]),
  );
  const next = `${nextValues['year']}-${nextValues['month']}-${nextValues['day']}`;
  return [start, zonedMidnight(next, timeZone), date];
}

function zonedMidnight(date: string, timeZone: string): Date {
  const target = Date.parse(`${date}T00:00:00Z`);
  let result = target;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(result));
    const values = Object.fromEntries(
      parts.map(({ type, value }) => [type, value]),
    );
    const represented = Date.UTC(
      Number(values['year']),
      Number(values['month']) - 1,
      Number(values['day']),
      Number(values['hour']),
      Number(values['minute']),
      Number(values['second']),
    );
    result += target - represented;
  }
  return new Date(result);
}
