import { Injectable, Logger } from '@nestjs/common';
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

  async updateItem(tenantId: string, itemId: string, data: { name?: string }) {
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
    data: { name?: string },
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
    data: { name?: string },
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
    data: { name?: string },
  ) {
    const modifier = await this.prisma.modifier.update({
      where: { id_tenantId: { id: modifierId, tenantId } },
      data,
    });
    await this.invalidateMenu(tenantId);
    return modifier;
  }

  async updateStopList(tenantId: string, itemId: string, isStopped: boolean) {
    const stopListItem = await this.prisma.stopListItem.upsert({
      where: { menuItemId: itemId },
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
