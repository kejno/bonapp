import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MenuGateway } from '../menu/menu.gateway';

@Injectable()
export class GuestSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly menuGateway: MenuGateway,
  ) {}

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
