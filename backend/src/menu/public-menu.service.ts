import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../identity/entities/tenant.entity.js';
import { MenuCategory } from './entities/menu-category.entity.js';
import { MenuItem } from './entities/menu-item.entity.js';

export interface PublicMenuCategoryDto {
  id: string;
  name: string;
  sortOrder: number;
  items: MenuItem[];
}

export interface PublicMenuDto {
  tenantId: string;
  name: string;
  slug: string;
  categories: PublicMenuCategoryDto[];
}

@Injectable()
export class PublicMenuService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(MenuCategory)
    private readonly categoryRepo: Repository<MenuCategory>,
    @InjectRepository(MenuItem)
    private readonly itemRepo: Repository<MenuItem>,
  ) {}

  async getPublicMenu(slug: string): Promise<PublicMenuDto> {
    const tenant = await this.tenantRepo.findOne({ where: { slug } });
    if (!tenant) throw new NotFoundException('Venue not found');

    const categories = await this.categoryRepo.find({
      where: { tenantId: tenant.id, isVisible: true },
      order: { sortOrder: 'ASC' },
    });

    const items = await this.itemRepo.find({
      where: { tenantId: tenant.id, isAvailable: true },
    });

    const itemsByCategory = new Map<string, MenuItem[]>();
    for (const item of items) {
      const list = itemsByCategory.get(item.categoryId) ?? [];
      list.push(item);
      itemsByCategory.set(item.categoryId, list);
    }

    const categoryDtos: PublicMenuCategoryDto[] = categories
      .map(cat => ({
        id: cat.id,
        name: cat.name,
        sortOrder: cat.sortOrder,
        items: itemsByCategory.get(cat.id) ?? [],
      }))
      .filter(cat => cat.items.length > 0);

    return { tenantId: tenant.id, name: tenant.name, slug: tenant.slug, categories: categoryDtos };
  }
}
