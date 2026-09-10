import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { CreateMenuItemDto } from './dto/create-menu-item.dto.js';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto.js';
import { MenuCategory } from './entities/menu-category.entity.js';
import { MenuItem } from './entities/menu-item.entity.js';

@Injectable()
export class MenuItemService {
  constructor(
    @InjectRepository(MenuItem)
    private readonly itemRepo: Repository<MenuItem>,
    @InjectRepository(MenuCategory)
    private readonly categoryRepo: Repository<MenuCategory>,
  ) {}

  getItems(tenantId: string, categoryId?: string): Promise<MenuItem[]> {
    const where: FindOptionsWhere<MenuItem> = { tenantId };
    if (categoryId) where.categoryId = categoryId;
    return this.itemRepo.find({ where });
  }

  async createItem(tenantId: string, dto: CreateMenuItemDto): Promise<MenuItem> {
    const category = await this.categoryRepo.findOne({ where: { id: dto.categoryId, tenantId } });
    if (!category) throw new NotFoundException('Category not found');

    const item = this.itemRepo.create({ ...dto, tenantId });
    return this.itemRepo.save(item);
  }

  async updateItem(tenantId: string, id: string, dto: UpdateMenuItemDto): Promise<MenuItem> {
    const item = await this.itemRepo.findOne({ where: { id, tenantId } });
    if (!item) throw new NotFoundException('Menu item not found');

    if (dto.categoryId !== undefined && dto.categoryId !== item.categoryId) {
      const category = await this.categoryRepo.findOne({ where: { id: dto.categoryId, tenantId } });
      if (!category) throw new NotFoundException('Category not found');
    }

    Object.assign(item, dto);
    return this.itemRepo.save(item);
  }

  async deleteItem(tenantId: string, id: string): Promise<void> {
    const item = await this.itemRepo.findOne({ where: { id, tenantId } });
    if (!item) throw new NotFoundException('Menu item not found');
    await this.itemRepo.remove(item);
  }
}
