import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { menuCacheKey } from '../cache/cache.constants';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MenuAdminService {
  private readonly logger = new Logger(MenuAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async updateItem(
    tenantId: string,
    itemId: string,
    data: Prisma.MenuItemUpdateInput,
  ) {
    const item = await this.prisma.menuItem.update({
      where: { id_tenantId: { id: itemId, tenantId } },
      data,
    });
    await this.invalidateMenu(tenantId);
    return item;
  }

  async updateCategory(
    tenantId: string,
    categoryId: string,
    data: Prisma.MenuCategoryUpdateInput,
  ) {
    const category = await this.prisma.menuCategory.update({
      where: { id_tenantId: { id: categoryId, tenantId } },
      data,
    });
    await this.invalidateMenu(tenantId);
    return category;
  }

  async updateModifierGroup(
    tenantId: string,
    modifierGroupId: string,
    data: Prisma.ModifierGroupUpdateInput,
  ) {
    const modifierGroup = await this.prisma.modifierGroup.update({
      where: { id_tenantId: { id: modifierGroupId, tenantId } },
      data,
    });
    await this.invalidateMenu(tenantId);
    return modifierGroup;
  }

  async updateModifier(
    tenantId: string,
    modifierId: string,
    data: Prisma.ModifierUpdateInput,
  ) {
    const modifier = await this.prisma.modifier.update({
      where: { id_tenantId: { id: modifierId, tenantId } },
      data,
    });
    await this.invalidateMenu(tenantId);
    return modifier;
  }

  async updateStopList(tenantId: string, itemId: string, isStopped: boolean) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id_tenantId: { id: itemId, tenantId } },
      select: { id: true },
    });
    if (!item) {
      throw new NotFoundException(`Menu item ${itemId} not found for tenant`);
    }

    const stopListItem = await this.prisma.stopListItem.upsert({
      where: { menuItemId_tenantId: { menuItemId: itemId, tenantId } },
      create: { tenantId, menuItemId: itemId, isStopped },
      update: { isStopped },
    });
    await this.invalidateMenu(tenantId);
    return stopListItem;
  }

  async invalidateMenu(tenantId: string): Promise<void> {
    const key = menuCacheKey(tenantId);
    try {
      await this.cache.del(key);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Unable to invalidate menu cache ${key}: ${message}`);
    }
  }
}
