import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateMenuCategoryDto } from './dto/create-menu-category.dto.js';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto.js';
import { MenuCategory } from './entities/menu-category.entity.js';
import { MenuItem } from './entities/menu-item.entity.js';

@Injectable()
export class MenuCategoryService {
  constructor(
    @InjectRepository(MenuCategory)
    private readonly categoryRepo: Repository<MenuCategory>,
    @InjectRepository(MenuItem)
    private readonly itemRepo: Repository<MenuItem>,
  ) {}

  getCategories(tenantId: string): Promise<MenuCategory[]> {
    return this.categoryRepo.find({ where: { tenantId }, order: { sortOrder: 'ASC' } });
  }

  async createCategory(tenantId: string, dto: CreateMenuCategoryDto): Promise<MenuCategory> {
    const category = this.categoryRepo.create({ ...dto, tenantId });
    return this.categoryRepo.save(category);
  }

  async updateCategory(tenantId: string, id: string, dto: UpdateMenuCategoryDto): Promise<MenuCategory> {
    const category = await this.categoryRepo.findOne({ where: { id, tenantId } });
    if (!category) throw new NotFoundException('Category not found');
    Object.assign(category, dto);
    return this.categoryRepo.save(category);
  }

  async deleteCategory(tenantId: string, id: string): Promise<void> {
    const category = await this.categoryRepo.findOne({ where: { id, tenantId } });
    if (!category) throw new NotFoundException('Category not found');

    const itemCount = await this.itemRepo.count({ where: { categoryId: id, tenantId } });
    if (itemCount > 0) throw new ConflictException('Cannot delete category with existing menu items');

    await this.categoryRepo.remove(category);
  }
}
