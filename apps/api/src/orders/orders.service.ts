import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.db.order.findMany();
  }

  async findOne(id: string) {
    const order = await this.prisma.db.order.findFirst({ where: { id } });
    if (!order) {
      throw new ForbiddenException();
    }
    return order;
  }
}
