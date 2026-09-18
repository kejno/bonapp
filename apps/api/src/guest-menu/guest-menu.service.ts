import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GuestMenuService {
  constructor(private readonly prisma: PrismaService) {}

  async getMenu(token: string) {
    const session = await this.prisma.tableSession.findUnique({
      where: { token },
      include: { table: { select: { number: true } } },
    });

    if (
      !session ||
      !session.isActive ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      throw new ForbiddenException('Сессия стола недействительна');
    }

    const categories = await this.prisma.menuCategory.findMany({
      where: { tenantId: session.tenantId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        dishes: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            modifiers: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
            stopListEntries: {
              where: {
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
              select: { id: true },
            },
          },
        },
      },
    });

    return {
      tableNumber: session.table.number,
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        dishes: category.dishes.map((dish) => ({
          id: dish.id,
          name: dish.name,
          description: dish.description,
          price: dish.price,
          imageUrl: dish.imageUrl,
          isHit: dish.isHit,
          isInStopList: dish.stopListEntries.length > 0,
          modifiers: dish.modifiers.map((modifier) => ({
            id: modifier.id,
            name: modifier.name,
            priceDelta: modifier.priceDelta,
          })),
        })),
      })),
    };
  }
}
