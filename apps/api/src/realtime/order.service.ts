import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrderService {
  constructor(private readonly prisma: PrismaService) {}

  async updateStatus(id: string, tenantId: string, status: OrderStatus) {
    const order = await this.prisma.order.findFirst({
      where: { id, tenantId },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.tenantId !== tenantId)
      throw new ForbiddenException('Order belongs to another tenant');
    return this.prisma.order.update({ where: { id }, data: { status } });
  }
}
