import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { menuCacheKey } from '../cache/cache.constants';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateModifierGroupData {
  name: string;
  minSelected?: number;
  maxSelected?: number;
}

export interface UpdateModifierOptionData {
  name?: string;
  extraPriceByn?: number;
  isDefault?: boolean;
}

export interface CreateModifierOptionData {
  name: string;
  extraPriceByn?: number;
  isDefault?: boolean;
}

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
      where: { tenantId_menuItemId: { tenantId, menuItemId: itemId } },
      create: { tenantId, menuItemId: itemId, isStopped },
      update: { isStopped },
    });
    await this.invalidateMenu(tenantId);
    return stopListItem;
  }

  async listModifierGroups(tenantId: string, itemId: string) {
    const db = this.prisma.forTenant(tenantId);
    const item = await db.menuItem.findFirst({
      where: { id: itemId },
      select: { id: true },
    });
    if (!item) throw new NotFoundException(`Menu item ${itemId} not found`);

    return db.modifierGroup.findMany({
      where: { itemId, isActive: true },
      include: {
        modifierOptions: { where: { isActive: true } },
      },
    });
  }

  async createModifierGroup(
    tenantId: string,
    itemId: string,
    data: CreateModifierGroupData,
  ) {
    const db = this.prisma.forTenant(tenantId);
    const item = await db.menuItem.findFirst({
      where: { id: itemId },
      select: { id: true },
    });
    if (!item) throw new NotFoundException(`Menu item ${itemId} not found`);

    const group = await db.modifierGroup.create({
      data: {
        tenantId,
        itemId,
        name: data.name,
        minSelection: data.minSelected ?? 0,
        maxSelection: data.maxSelected ?? null,
      },
      include: { modifierOptions: true },
    });
    await this.invalidateMenu(tenantId);
    return group;
  }

  async deactivateModifierGroup(tenantId: string, groupId: string) {
    const db = this.prisma.forTenant(tenantId);
    const group = await db.modifierGroup.findFirst({
      where: { id: groupId },
      select: { id: true },
    });
    if (!group) throw new NotFoundException(`Modifier group ${groupId} not found`);

    const result = await this.prisma.transactionForTenant(tenantId, async (tx) => {
      await tx.modifierOption.updateMany({
        where: { groupId, group: { is: { tenantId } } },
        data: { isActive: false },
      });
      return tx.modifierGroup.update({
        where: { id_tenantId: { id: groupId, tenantId } },
        data: { isActive: false },
      });
    });
    await this.invalidateMenu(tenantId);
    return result;
  }

  async createModifierOption(
    tenantId: string,
    groupId: string,
    data: CreateModifierOptionData,
  ) {
    const db = this.prisma.forTenant(tenantId);
    const group = await db.modifierGroup.findFirst({
      where: { id: groupId },
      select: { id: true },
    });
    if (!group) throw new NotFoundException(`Modifier group ${groupId} not found`);

    const option = await db.modifierOption.create({
      data: {
        groupId,
        name: data.name,
        extraPriceByn: data.extraPriceByn ?? 0,
        isDefault: data.isDefault ?? false,
      },
    });
    await this.invalidateMenu(tenantId);
    return option;
  }

  async updateModifierOption(
    tenantId: string,
    optionId: string,
    data: UpdateModifierOptionData,
  ) {
    const db = this.prisma.forTenant(tenantId);
    const existing = await db.modifierOption.findFirst({
      where: { id: optionId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`Modifier option ${optionId} not found`);

    await db.modifierOption.updateMany({ where: { id: optionId }, data });
    await this.invalidateMenu(tenantId);
    const option = await db.modifierOption.findFirst({ where: { id: optionId } });
    if (!option) throw new NotFoundException(`Modifier option ${optionId} not found`);
    return option;
  }

  async deactivateModifierOption(tenantId: string, optionId: string) {
    const db = this.prisma.forTenant(tenantId);
    const existing = await db.modifierOption.findFirst({
      where: { id: optionId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`Modifier option ${optionId} not found`);

    await db.modifierOption.updateMany({
      where: { id: optionId },
      data: { isActive: false },
    });
    await this.invalidateMenu(tenantId);
    const option = await db.modifierOption.findFirst({ where: { id: optionId } });
    if (!option) throw new NotFoundException(`Modifier option ${optionId} not found`);
    return option;
  }

  async updateItemStopList(
    tenantId: string,
    itemId: string,
    isInStopList: boolean,
  ) {
    const db = this.prisma.forTenant(tenantId);
    const item = await db.menuItem.findFirst({
      where: { id: itemId },
      select: { id: true },
    });
    if (!item) throw new NotFoundException(`Menu item ${itemId} not found`);

    const result = await db.menuItem.update({
      where: { tenantId_id: { tenantId, id: itemId } },
      data: { isInStopList },
    });
    await this.invalidateMenu(tenantId);
    return result;
  }

  async invalidateMenu(tenantId: string): Promise<void> {
    await this.cache.del(menuCacheKey(tenantId));
  }
}
