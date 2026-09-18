import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentStatus, TableStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersEvents } from './orders.events';

type CreateOrderInput = {
  phone: string;
  tableId?: string;
  items: Array<{ menuItemId: string; quantity: number }>;
};

const activeStatuses = [OrderStatus.NEW, OrderStatus.COOKING, OrderStatus.READY];
const transitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
  [OrderStatus.NEW]: [OrderStatus.COOKING, OrderStatus.CANCELLED],
  [OrderStatus.COOKING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.SERVED, OrderStatus.CANCELLED],
  [OrderStatus.SERVED]: [OrderStatus.CANCELLED],
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: OrdersEvents,
  ) {}

  async create(tenantId: string, input: CreateOrderInput) {
    const phone = normalizePhone(input.phone);
    if (!phone || !Array.isArray(input.items) || input.items.length === 0 || input.items.some((item) => item.quantity < 1)) {
      throw new BadRequestException('Телефон и хотя бы одна позиция с положительным количеством обязательны');
    }

    return this.prisma.$transaction(async (tx) => {
      const menuItems = await tx.menuItem.findMany({
        where: { tenantId, id: { in: input.items.map((item) => item.menuItemId) } },
        include: { kitchen: true },
      });
      if (menuItems.length !== new Set(input.items.map((item) => item.menuItemId)).size) {
        throw new BadRequestException('Одна или несколько позиций меню не найдены');
      }
      if (input.tableId) {
        const table = await tx.restaurantTable.findFirst({ where: { id: input.tableId, tenantId } });
        if (!table) throw new NotFoundException('Стол не найден');
      }
      const guest = await tx.guest.upsert({
        where: { tenantId_phone: { tenantId, phone } },
        update: {},
        create: { tenantId, phone },
      });
      const itemById = new Map(menuItems.map((item) => [item.id, item]));
      const order = await tx.order.create({
        data: {
          tenantId,
          guestId: guest.id,
          tableId: input.tableId,
          items: {
            create: input.items.map((item) => {
              const menuItem = itemById.get(item.menuItemId)!;
              return {
                menuItemId: menuItem.id,
                kitchenId: menuItem.kitchenId,
                name: menuItem.name,
                unitPrice: menuItem.price,
                quantity: item.quantity,
              };
            }),
          },
        },
        include: { items: true, payments: true },
      });
      if (input.tableId) {
        await tx.restaurantTable.update({ where: { id: input.tableId }, data: { status: TableStatus.OCCUPIED } });
      }
      return order;
    });
  }

  async findOne(tenantId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, tenantId },
      include: { items: true, payments: true, guest: true, table: true },
    });
    if (!order) throw new NotFoundException('Заказ не найден');
    return order;
  }

  async findActive(tenantId: string) {
    const orders = await this.prisma.order.findMany({
      where: { tenantId, status: { in: activeStatuses } },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });
    return orders.map((order) => ({
      id: order.id,
      status: order.status,
      items: aggregateItems(order.items),
    }));
  }

  async changeStatus(tenantId: string, id: string, status: OrderStatus) {
    if (status === OrderStatus.PAID) {
      throw new BadRequestException('Статус PAID устанавливается только платёжным процессом');
    }
    const order = await this.prisma.order.findFirst({ where: { id, tenantId } });
    if (!order) throw new NotFoundException('Заказ не найден');
    if (!transitions[order.status]?.includes(status)) {
      throw new BadRequestException('Недопустимый переход статуса заказа');
    }
    const updated = await this.prisma.order.update({ where: { id }, data: { status } });
    if (order.tableId && (status === OrderStatus.SERVED || status === OrderStatus.CANCELLED)) {
      await this.prisma.restaurantTable.update({ where: { id: order.tableId }, data: { status: status === OrderStatus.SERVED ? TableStatus.OCCUPIED : TableStatus.FREE } });
    }
    this.events.publishStatusChanged(tenantId, id, status);
    return updated;
  }

  async markPaidAfterSuccessfulPayment(tenantId: string, orderId: string, paymentId: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId, tenantId } });
      if (!order) throw new NotFoundException('Заказ не найден');
      if (order.status !== OrderStatus.SERVED) {
        throw new BadRequestException('Оплатить можно только выданный заказ');
      }
      const payment = await tx.payment.findFirst({
        where: { id: paymentId, orderId, status: PaymentStatus.SUCCEEDED },
      });
      if (!payment) throw new BadRequestException('Успешный платёж для заказа не найден');
      const paidOrder = await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.PAID } });
      if (order.tableId) {
        await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: TableStatus.FREE } });
      }
      return paidOrder;
    });
    this.events.publishStatusChanged(tenantId, orderId, OrderStatus.PAID);
    return updated;
  }
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return '';
  return `+${digits}`;
}

function aggregateItems(items: Array<{ kitchenId: string; menuItemId: string; name: string; quantity: number }>) {
  const grouped = new Map<string, { kitchenId: string; menuItemId: string; name: string; quantity: number }>();
  for (const item of items) {
    const key = `${item.kitchenId}:${item.menuItemId}`;
    const existing = grouped.get(key);
    if (existing) existing.quantity += item.quantity;
    else grouped.set(key, { ...item });
  }
  return [...grouped.values()];
}
