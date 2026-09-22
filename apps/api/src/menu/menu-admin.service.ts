import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { menuCacheKey } from '../cache/cache.constants';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MenuAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async updateItem(
    tenantId: string,
    itemId: string,
    data: Prisma.MenuItemUpdateInput,
  ) {
    const item = await this.prisma.forTenant(tenantId).menuItem.update({
      where: { tenantId_id: { tenantId, id: itemId } },
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
    const category = await this.prisma.forTenant(tenantId).menuCategory.update({
      where: { tenantId_id: { tenantId, id: categoryId } },
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
    const modifierGroup = await this.prisma.forTenant(tenantId).modifierGroup.update({
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
    const modifier = await this.prisma.forTenant(tenantId).modifier.update({
      where: { id_tenantId: { id: modifierId, tenantId } },
      data,
    });
    await this.invalidateMenu(tenantId);
    return modifier;
  }

  async updateStopList(tenantId: string, itemId: string, isStopped: boolean) {
    const db = this.prisma.forTenant(tenantId);
    const item = await db.menuItem.findUnique({
      where: { tenantId_id: { tenantId, id: itemId } },
      select: { id: true },
    });
    if (!item) {
      throw new NotFoundException(`Menu item ${itemId} not found for tenant`);
    }

    const stopListItem = await db.stopListItem.upsert({
      where: { menuItemId_tenantId: { menuItemId: itemId, tenantId } },
      create: { tenantId, menuItemId: itemId, isStopped },
      update: { isStopped },
    });
    await this.invalidateMenu(tenantId);
    return stopListItem;
  }

  async invalidateMenu(tenantId: string): Promise<void> {
    await this.cache.del(menuCacheKey(tenantId));
  }
}
