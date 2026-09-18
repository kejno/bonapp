import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MenuCacheService } from './menu-cache.service';

type CategoryInput = {
  name?: unknown;
  sort_order?: unknown;
  is_visible?: unknown;
  pos_category_id?: unknown;
};
type ItemInput = {
  name?: unknown;
  category_id?: unknown;
  price?: unknown;
  description?: unknown;
  image_url?: unknown;
  is_active?: unknown;
  is_in_stop_list?: unknown;
};
type ItemFilters = {
  category?: string;
  is_active?: boolean;
  is_in_stop_list?: boolean;
};

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: MenuCacheService,
  ) {}

  listCategories(tenantId: string) {
    return this.prisma.menuCategory.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  async createCategory(tenantId: string, input: CategoryInput) {
    const data = this.categoryData(input, true);
    const category = await this.prisma.menuCategory.create({
      data: {
        tenantId,
        name: data.name!,
        sortOrder: data.sortOrder,
        isVisible: data.isVisible,
        posCategoryId: data.posCategoryId,
      },
    });
    await this.cache.invalidate(tenantId);
    return category;
  }

  async updateCategory(tenantId: string, id: string, input: CategoryInput) {
    await this.categoryOrThrow(tenantId, id);
    const category = await this.prisma.menuCategory.update({
      where: { id },
      data: this.categoryData(input, false),
    });
    await this.cache.invalidate(tenantId);
    return category;
  }

  async deleteCategory(tenantId: string, id: string) {
    await this.categoryOrThrow(tenantId, id);
    await this.prisma.menuCategory.delete({ where: { id } });
    await this.cache.invalidate(tenantId);
  }

  listItems(tenantId: string, filters: ItemFilters) {
    return this.prisma.menuItem.findMany({
      where: {
        tenantId,
        ...(filters.category !== undefined && { categoryId: filters.category }),
        ...(filters.is_active !== undefined && { isActive: filters.is_active }),
        ...(filters.is_in_stop_list !== undefined && {
          isInStopList: filters.is_in_stop_list,
        }),
      },
      include: { category: true },
      orderBy: [
        { category: { sortOrder: 'asc' } },
        { categoryId: 'asc' },
        { name: 'asc' },
        { id: 'asc' },
      ],
    });
  }

  async createItem(tenantId: string, input: ItemInput) {
    const data = this.itemData(input, true);
    await this.categoryOrThrow(tenantId, data.categoryId!);
    const item = await this.prisma.menuItem.create({
      data: {
        tenantId,
        name: data.name!,
        categoryId: data.categoryId!,
        price: data.price!,
        description: data.description,
        imageUrl: data.imageUrl,
        isActive: data.isActive,
        isInStopList: data.isInStopList,
      },
    });
    await this.cache.invalidate(tenantId);
    return item;
  }

  async updateItem(tenantId: string, id: string, input: ItemInput) {
    await this.itemOrThrow(tenantId, id);
    const data = this.itemData(input, false);
    if (data.categoryId) await this.categoryOrThrow(tenantId, data.categoryId);
    const item = await this.prisma.menuItem.update({ where: { id }, data });
    await this.cache.invalidate(tenantId);
    return item;
  }

  async deleteItem(tenantId: string, id: string) {
    await this.itemOrThrow(tenantId, id);
    await this.prisma.menuItem.delete({ where: { id } });
    await this.cache.invalidate(tenantId);
  }

  private async categoryOrThrow(tenantId: string, id: string) {
    const category = await this.prisma.menuCategory.findFirst({
      where: { id, tenantId },
    });
    if (!category) throw new NotFoundException('Menu category was not found');
    return category;
  }

  private async itemOrThrow(tenantId: string, id: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id, tenantId },
    });
    if (!item) throw new NotFoundException('Menu item was not found');
    return item;
  }

  private categoryData(input: CategoryInput, creating: boolean) {
    const data: {
      name?: string;
      sortOrder?: number;
      isVisible?: boolean;
      posCategoryId?: string | null;
    } = {};
    if (creating || input.name !== undefined)
      data.name = this.name(input.name, 'name');
    if (input.sort_order !== undefined)
      data.sortOrder = this.integer(input.sort_order, 'sort_order');
    if (input.is_visible !== undefined)
      data.isVisible = this.boolean(input.is_visible, 'is_visible');
    if (input.pos_category_id !== undefined)
      data.posCategoryId =
        input.pos_category_id === null
          ? null
          : this.nonEmptyString(input.pos_category_id, 'pos_category_id');
    return data;
  }

  private itemData(input: ItemInput, creating: boolean) {
    const data: {
      name?: string;
      categoryId?: string;
      price?: number;
      description?: string | null;
      imageUrl?: string | null;
      isActive?: boolean;
      isInStopList?: boolean;
    } = {};
    if (creating || input.name !== undefined)
      data.name = this.name(input.name, 'name');
    if (creating || input.category_id !== undefined)
      data.categoryId = this.nonEmptyString(input.category_id, 'category_id');
    if (creating || input.price !== undefined) {
      const price = this.integer(input.price, 'price');
      if (price < 0)
        throw new BadRequestException('price must be non-negative');
      data.price = price;
    }
    if (input.description !== undefined)
      data.description =
        input.description === null || input.description === ''
          ? null
          : this.string(input.description, 'description');
    if (input.image_url !== undefined)
      data.imageUrl =
        input.image_url === null ? null : this.url(input.image_url);
    if (input.is_active !== undefined)
      data.isActive = this.boolean(input.is_active, 'is_active');
    if (input.is_in_stop_list !== undefined)
      data.isInStopList = this.boolean(
        input.is_in_stop_list,
        'is_in_stop_list',
      );
    return data;
  }

  private name(value: unknown, field: string) {
    const name = this.nonEmptyString(value, field).trim();
    if (name.length > 255)
      throw new BadRequestException(`${field} must be at most 255 characters`);
    return name;
  }
  private nonEmptyString(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim())
      throw new BadRequestException(`${field} must be a non-empty string`);
    return value.trim();
  }
  private string(value: unknown, field: string) {
    if (typeof value !== 'string')
      throw new BadRequestException(`${field} must be a string`);
    return value;
  }
  private integer(value: unknown, field: string) {
    if (typeof value !== 'number' || !Number.isInteger(value))
      throw new BadRequestException(`${field} must be an integer`);
    return value;
  }
  private boolean(value: unknown, field: string) {
    if (typeof value !== 'boolean')
      throw new BadRequestException(`${field} must be a boolean`);
    return value;
  }
  private url(value: unknown) {
    const url = this.nonEmptyString(value, 'image_url');
    try {
      new URL(url);
    } catch {
      throw new BadRequestException('image_url must be a URL');
    }
    return url;
  }
}
