import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MenuCacheService } from './menu-cache.service';
import { MenuNotifierService } from './menu-notifier.service';
import {
  CreateModifierGroupDto,
  CreateModifierOptionDto,
  UpdateModifierGroupDto,
  UpdateModifierOptionDto,
} from './menu.types';

const activeOptions = { where: { isActive: true } };

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: MenuCacheService,
    private readonly notifier: MenuNotifierService,
  ) {}

  async createGroup(
    tenantId: string,
    itemId: string,
    dto: CreateModifierGroupDto,
  ) {
    this.assertSelectionBounds(dto.min_selected, dto.max_selected);
    await this.getItem(tenantId, itemId);

    return this.prisma.modifierGroup.create({
      data: {
        itemId,
        name: dto.name,
        minSelected: dto.min_selected,
        maxSelected: dto.max_selected,
      },
      include: { options: activeOptions },
    });
  }

  async listGroups(tenantId: string, itemId: string) {
    await this.getItem(tenantId, itemId);
    return this.prisma.modifierGroup.findMany({
      where: { itemId, isActive: true },
      include: { options: activeOptions },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateGroup(
    tenantId: string,
    groupId: string,
    dto: UpdateModifierGroupDto,
  ) {
    const group = await this.getGroup(tenantId, groupId);
    const minSelected = dto.min_selected ?? group.minSelected;
    const maxSelected = dto.max_selected ?? group.maxSelected;
    this.assertSelectionBounds(minSelected, maxSelected);
    this.assertDefaultBounds(group.options, minSelected, maxSelected);

    return this.prisma.modifierGroup.update({
      where: { id: groupId },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.min_selected === undefined
          ? {}
          : { minSelected: dto.min_selected }),
        ...(dto.max_selected === undefined
          ? {}
          : { maxSelected: dto.max_selected }),
      },
      include: { options: activeOptions },
    });
  }

  async deleteGroup(tenantId: string, groupId: string) {
    await this.getGroup(tenantId, groupId);
    return this.prisma.$transaction(async (transaction) => {
      await transaction.modifierOption.updateMany({
        where: { groupId, isActive: true },
        data: { isActive: false },
      });
      return transaction.modifierGroup.update({
        where: { id: groupId },
        data: { isActive: false },
      });
    });
  }

  async createOption(
    tenantId: string,
    groupId: string,
    dto: CreateModifierOptionDto,
  ) {
    const group = await this.getGroup(tenantId, groupId);
    this.assertPrice(dto.extra_price_byn);
    this.assertDefaultBounds(
      [...group.options, { isDefault: dto.is_default }],
      group.minSelected,
      group.maxSelected,
    );

    return this.prisma.modifierOption.create({
      data: {
        groupId,
        name: dto.name,
        extraPriceByn: dto.extra_price_byn,
        isDefault: dto.is_default,
      },
    });
  }

  async updateOption(
    tenantId: string,
    optionId: string,
    dto: UpdateModifierOptionDto,
  ) {
    const option = await this.getOption(tenantId, optionId);
    this.assertPrice(dto.extra_price_byn);
    const options = option.group.options.map((currentOption) =>
      currentOption.id === optionId
        ? {
            ...currentOption,
            isDefault: dto.is_default ?? currentOption.isDefault,
          }
        : currentOption,
    );
    this.assertDefaultBounds(
      options,
      option.group.minSelected,
      option.group.maxSelected,
    );

    return this.prisma.modifierOption.update({
      where: { id: optionId },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.extra_price_byn === undefined
          ? {}
          : { extraPriceByn: dto.extra_price_byn }),
        ...(dto.is_default === undefined ? {} : { isDefault: dto.is_default }),
      },
    });
  }

  async deleteOption(tenantId: string, optionId: string) {
    await this.getOption(tenantId, optionId);
    return this.prisma.modifierOption.update({
      where: { id: optionId },
      data: { isActive: false },
    });
  }

  async updateStopList(
    tenantId: string,
    itemId: string,
    isInStopList: boolean,
  ) {
    await this.getItem(tenantId, itemId);
    const item = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: { isInStopList },
      select: { id: true, isInStopList: true },
    });
    await this.cache.invalidateGuestMenu(tenantId);
    this.notifier.notifyStopListChanged(tenantId, {
      itemId: item.id,
      isInStopList: item.isInStopList,
    });
    return item;
  }

  async getGuestMenu(tenantId: string) {
    return this.prisma.menuItem.findMany({
      where: { tenantId },
      select: { id: true, name: true, isInStopList: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async getItem(tenantId: string, itemId: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id: itemId, tenantId },
    });
    if (!item) throw new NotFoundException('Menu item not found');
    return item;
  }

  private async getGroup(tenantId: string, groupId: string) {
    const group = await this.prisma.modifierGroup.findFirst({
      where: { id: groupId, isActive: true, item: { tenantId } },
      include: { options: activeOptions },
    });
    if (!group) throw new NotFoundException('Modifier group not found');
    return group;
  }

  private async getOption(tenantId: string, optionId: string) {
    const option = await this.prisma.modifierOption.findFirst({
      where: {
        id: optionId,
        isActive: true,
        group: { isActive: true, item: { tenantId } },
      },
      include: { group: { include: { options: activeOptions } } },
    });
    if (!option) throw new NotFoundException('Modifier option not found');
    return option;
  }

  private assertSelectionBounds(minSelected: number, maxSelected: number) {
    if (
      !Number.isInteger(minSelected) ||
      !Number.isInteger(maxSelected) ||
      minSelected < 0 ||
      maxSelected < minSelected ||
      maxSelected < 1
    ) {
      throw new BadRequestException('Invalid modifier selection bounds');
    }
  }

  private assertDefaultBounds(
    options: Array<{ isDefault: boolean }>,
    minSelected: number,
    maxSelected: number,
  ) {
    const defaultCount = options.filter((option) => option.isDefault).length;
    if (
      defaultCount > maxSelected ||
      (minSelected > 0 && defaultCount < minSelected)
    ) {
      throw new BadRequestException(
        'Default options do not satisfy selection bounds',
      );
    }
  }

  private assertPrice(price: number | undefined) {
    if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
      throw new BadRequestException('Invalid extra price');
    }
  }
}
