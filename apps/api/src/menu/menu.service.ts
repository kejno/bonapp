import { Injectable } from '@nestjs/common';
import { MENU_CACHE_TTL_SECONDS, menuCacheKey } from '../cache/cache.constants';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getGuestMenu(tenantId: string) {
    const key = menuCacheKey(tenantId);
    const cached = await this.readCachedMenu(key);
    if (cached !== null) {
      return cached;
    }

    const categories = await this.prisma.forTenant(tenantId).menuCategory.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        menuItems: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          include: {
            menuItemModifierGroups: {
              orderBy: { sortOrder: 'asc' },
              include: {
                modifierGroup: {
                  include: {
                    modifiers: {
                      orderBy: { sortOrder: 'asc' },
                    },
                  },
                },
              },
            },
            stopListItem: { select: { isStopped: true } },
          },
        },
      },
    });

    const menu = categories.map(({ menuItems, ...category }) => ({
      ...category,
      items: menuItems.map(({ menuItemModifierGroups, ...item }) => ({
        ...item,
        modifierGroups: menuItemModifierGroups.map(({ sortOrder, modifierGroup }) => ({
          sortOrder,
          modifierGroup,
        })),
      })),
    }));

    await this.writeCachedMenu(key, menu);
    return menu;
  }

  private async readCachedMenu(key: string): Promise<unknown[] | null> {
    return this.cache.getJson<unknown[]>(key);
  }

  private async writeCachedMenu(key: string, menu: unknown[]): Promise<void> {
    await this.cache.setJson(key, menu, MENU_CACHE_TTL_SECONDS);
  }
}
