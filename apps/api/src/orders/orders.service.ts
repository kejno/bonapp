import { Injectable, NotFoundException } from '@nestjs/common';
import type { OrderSnapshot, OrderStatus } from '@bonapp/shared-types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findSnapshot(orderId: string): Promise<OrderSnapshot> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Заказ не найден');

    return this.toSnapshot(order);
  }

  async updateStatus(
    orderId: string,
    status: OrderStatus,
  ): Promise<OrderSnapshot> {
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { status },
    });
    return this.toSnapshot(order);
  }

  private toSnapshot(order: {
    id: string;
    dailyOrderNumber: number;
    status: string;
    estimatedReadyAt: Date | null;
  }): OrderSnapshot {
    return {
      orderId: order.id,
      dailyOrderNumber: order.dailyOrderNumber,
      status: order.status as OrderStatus,
      estimatedReadyAt: order.estimatedReadyAt?.toISOString() ?? null,
    };
  }
}
