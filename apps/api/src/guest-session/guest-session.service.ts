import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, ServiceMode } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MenuGateway } from '../menu/menu.gateway';
import { nextDailyOrderNumber, tenantLocalDate } from '../orders/daily-order-number';

@Injectable()
export class GuestSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly menuGateway: MenuGateway,
  ) {}

  async createGuestOrder(
    tenantId: string,
    tableId: string,
    input: { items: Array<{ menuItemId: string; quantity: number; selectedModifiers: string[] }>; comment: string; guestSessionId?: string | null },
  ) {
    if (!Array.isArray(input.items) || input.items.length === 0) throw new BadRequestException('Cart cannot be empty');
    if (typeof input.comment !== 'string' || input.comment.length > 255) throw new BadRequestException('Comment must be at most 255 characters');
    for (const item of input.items) {
      if (!item || typeof item.menuItemId !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20 || !Array.isArray(item.selectedModifiers) || item.selectedModifiers.some((id) => typeof id !== 'string')) {
        throw new BadRequestException('Invalid order item');
      }
    }

    const order = await this.prisma.transactionForTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true, dailyOrderNumber: true, dailyOrderNumberDate: true, serviceMode: true } });
      if (!tenant) throw new NotFoundException('Tenant not found');
      if (tenant.serviceMode === ServiceMode.VIEW_ONLY) throw new ConflictException('Ordering is disabled for this tenant');
      const today = tenantLocalDate(tenant.timezone);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
      const latestTenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { dailyOrderNumber: true, dailyOrderNumberDate: true } });
      if (!latestTenant) throw new NotFoundException('Tenant not found');
      const dailyOrderNumber = nextDailyOrderNumber(latestTenant.dailyOrderNumber, latestTenant.dailyOrderNumberDate, today);
      await tx.tenant.update({ where: { id: tenantId }, data: { dailyOrderNumber, dailyOrderNumberDate: today } });

      const pricedItems: Array<{ menuItemId: string; quantity: number; selectedModifiers: string[]; price: number; kitchenDepartment: string }> = [];
      for (const requested of input.items) {
        const menuItem = await tx.menuItem.findFirst({
          where: { id: requested.menuItemId, tenantId, isActive: true, isInStopList: false },
          include: {
            menuItemModifierGroups: { include: { modifierGroup: { include: { modifiers: true, modifierOptions: true } } } },
            modifierGroups: { include: { modifierOptions: true } },
            stopListItem: { select: { isStopped: true } },
          },
        });
        if (!menuItem || menuItem.stopListItem?.isStopped) throw new BadRequestException('One or more menu items are unavailable');
        const legacyGroups = menuItem.menuItemModifierGroups.map(({ modifierGroup }) => modifierGroup);
        const groups = [...legacyGroups, ...menuItem.modifierGroups]
          .filter((group, index, all) => group.isActive && all.findIndex((entry) => entry.id === group.id) === index);
        const allowed = [
          ...legacyGroups.filter((group) => group.isActive).flatMap((group) => group.modifiers.map((option) => ({ id: option.id, groupId: group.id, price: Number(option.price) }))),
          ...groups.flatMap((group) => group.modifierOptions.map((option) => ({ id: option.id, groupId: group.id, price: Number(option.extraPriceByn), active: option.isActive }))),
        ].filter((option) => !('active' in option) || option.active);
        const selected = new Set(requested.selectedModifiers);
        if (selected.size !== requested.selectedModifiers.length || requested.selectedModifiers.some((id) => !allowed.some((option) => option.id === id))) {
          throw new BadRequestException('Selected modifier is unavailable for this item');
        }
        for (const group of groups) {
          const count = requested.selectedModifiers.filter((id) => allowed.some((option) => option.id === id && option.groupId === group.id)).length;
          if (count < Math.max(group.isRequired ? 1 : 0, group.minSelection)) throw new BadRequestException(`Required modifiers are missing for ${menuItem.name}`);
          if (group.maxSelection !== null && count > group.maxSelection) throw new BadRequestException(`Too many modifiers selected for ${menuItem.name}`);
        }
        const modifiersPrice = requested.selectedModifiers.reduce((sum, id) => sum + (allowed.find((option) => option.id === id)?.price ?? 0), 0);
        pricedItems.push({ menuItemId: menuItem.id, quantity: requested.quantity, selectedModifiers: requested.selectedModifiers, price: Number((Number(menuItem.priceByn) + modifiersPrice).toFixed(2)), kitchenDepartment: menuItem.kitchenDepartment ?? 'HOT' });
      }
      const totalAmountByn = Number(pricedItems.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2));
      const created = await tx.order.create({ data: {
        tenantId, tableId, dailyOrderNumber, guestSessionId: input.guestSessionId ?? null, comment: input.comment,
        totalAmountByn, status: OrderStatus.NEW,
        items: { create: pricedItems.map((item) => ({
          itemId: item.menuItemId, quantity: item.quantity, unitPriceByn: item.price,
          selectedModifiers: item.selectedModifiers, status: OrderStatus.NEW,
          kitchenDepartment: item.kitchenDepartment,
        })) },
      }, select: { id: true, dailyOrderNumber: true, status: true, totalAmountByn: true, createdAt: true } });
      return created;
    });
    this.menuGateway.emitKitchenOrder(tenantId, 'order:created', order);
    return {
      orderId: order.id,
      dailyOrderNumber: order.dailyOrderNumber,
      status: order.status,
      totalAmountByn: Number(order.totalAmountByn),
      estimatedReadyTime: new Date(order.createdAt.getTime() + 12 * 60_000).toISOString(),
    };
  }

  async resolveByQrToken(qrToken: string) {
    const tableRow = await this.prisma.findTableByQrToken(qrToken);
    if (!tableRow) {
      throw new NotFoundException('QR token not found');
    }

    const { tenant, area, id, tableNumber, tenantId } = tableRow;
    const tableSessionToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    await this.prisma.unscopedClient.tableSession.create({
      data: {
        tenantId,
        tableId: id,
        tokenHash: createHash('sha256').update(tableSessionToken).digest('hex'),
        expiresAt,
      },
    });
    const scopedDb = this.prisma.forTenant(tenantId);

    const activeOrder = await scopedDb.order.findFirst({
      where: {
        tableId: id,
        status: { notIn: [OrderStatus.PAID, OrderStatus.CANCELLED] },
      },
      select: { id: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        logoUrl: tenant.logoUrl,
        brandColor: tenant.brandColor,
        currency: tenant.currency,
      },
      table: {
        id,
        tableNumber,
        areaName: area.name,
      },
      tableSessionToken,
      tableSessionExpiresAt: expiresAt,
      activeOrder: activeOrder
        ? {
            id: activeOrder.id,
            status: activeOrder.status,
            createdAt: activeOrder.createdAt,
          }
        : null,
    };
  }

  async getOrderStatus(orderId: string, tenantId: string, tableId: string) {
    const order = await this.prisma.forTenant(tenantId).order.findFirst({
      where: { id: orderId, tableId },
      select: { id: true, dailyOrderNumber: true, status: true, updatedAt: true },
    });
    if (!order) throw new ForbiddenException('Order does not belong to this table');
    return {
      id: order.id,
      dailyOrderNumber: order.dailyOrderNumber,
      status: order.status,
      updatedAt: order.updatedAt.toISOString(),
      estimatedReadyAt: order.status === OrderStatus.COOKING
        ? new Date(order.updatedAt.getTime() + 12 * 60_000).toISOString()
        : null,
    };
  }

  async addOrderItem(orderId: string, itemId: string, quantity: number, tenantId: string, tableId: string) {
    const created = await this.prisma.transactionForTenant(tenantId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, tableId, status: { in: [OrderStatus.NEW, OrderStatus.COOKING] }, isPaid: false },
        select: { id: true, status: true },
      });
      if (!order) throw new ForbiddenException('Active order does not belong to this table');
      const item = await tx.menuItem.findFirst({
        where: { id: itemId, isActive: true, isInStopList: false },
        select: { id: true, priceByn: true, kitchenDepartment: true, stopListItem: { select: { isStopped: true } } },
      });
      if (!item || item.stopListItem?.isStopped) throw new NotFoundException('Menu item is unavailable');
      const created = await tx.orderItem.create({
        data: {
          orderId,
          itemId,
          quantity,
          unitPriceByn: item.priceByn,
          selectedModifiers: [],
          status: order.status,
          kitchenDepartment: item.kitchenDepartment ?? 'HOT',
        },
      });
      await tx.order.update({
        where: { id_tenantId: { id: orderId, tenantId } },
        data: { totalAmountByn: { increment: Number(item.priceByn) * quantity } },
      });
      return created;
    });
    this.menuGateway.emitKitchenOrder(tenantId, 'order:updated', { id: orderId });
    return created;
  }
}
