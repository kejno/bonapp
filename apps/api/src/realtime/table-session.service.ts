import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TableSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async validateOrderAccess(
    token: string | undefined,
    orderId: string,
  ): Promise<void> {
    if (!token) throw new ForbiddenException('Missing table session token');

    const session = await this.prisma.tableSession.findUnique({
      where: { token },
      include: { orders: { where: { id: orderId }, select: { id: true } } },
    });
    if (
      !session ||
      !session.isActive ||
      session.expiresAt <= new Date() ||
      session.orders.length !== 1
    ) {
      throw new ForbiddenException('Table session cannot access this order');
    }
  }
}
