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
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        menuItems: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
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
            modifierGroups: {
              where: { isActive: true },
              orderBy: { id: 'asc' },
              include: { modifierOptions: { where: { isActive: true } } },
            },
            stopListItem: { select: { isStopped: true } },
          },
        },
      },
    });

    const menu = categories.map(({ menuItems, ...category }) => ({
      ...category,
      items: menuItems.map(({ menuItemModifierGroups, modifierGroups = [], ...item }) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        priceByn: item.priceByn,
        imageUrl: item.imageUrl,
        weightGrams: item.weightGrams,
        calories: item.calories,
        proteins: item.proteins,
        fats: item.fats,
        carbs: item.carbs,
        allergens: item.allergens,
        kitchenDepartment: item.kitchenDepartment,
        cookingTimeMinutes: item.cookingTimeMinutes,
        isInStopList: item.isInStopList || Boolean(item.stopListItem?.isStopped),
        isHit: item.isHit,
        isActive: item.isActive,
        stopListItem: item.stopListItem,
        modifierGroups: [
          ...menuItemModifierGroups
            .filter(({ modifierGroup }) => modifierGroup.isActive)
            .map(({ sortOrder, modifierGroup }) => ({ sortOrder, modifierGroup })),
          ...modifierGroups
            .filter(({ isActive }) => isActive)
            .map(({ modifierOptions, ...modifierGroup }, index) => ({
              sortOrder: menuItemModifierGroups.length + index,
              modifierGroup: {
                ...modifierGroup,
                modifiers: modifierOptions.map(({ id, name, extraPriceByn }) => ({ id, name, price: extraPriceByn })),
              },
            })),
        ]
          .filter((entry, index, entries) => entries.findIndex(({ modifierGroup }) => modifierGroup.id === entry.modifierGroup.id) === index)
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map(({ sortOrder, modifierGroup }) => ({
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
