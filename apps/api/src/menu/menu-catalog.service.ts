import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { menuCacheKey } from '../cache/cache.constants';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

export const ALLOWED_UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const IMAGE_EXTENSION_BY_CONTENT_TYPE: Record<(typeof ALLOWED_UPLOAD_CONTENT_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface CreateCategoryDto {
  name: string;
  sortOrder: number;
  isVisible: boolean;
  posCategoryId?: string;
}

export interface UpdateCategoryDto {
  name?: string;
  sortOrder?: number;
  isVisible?: boolean;
  posCategoryId?: string | null;
}

export interface ItemFilters {
  categoryId?: string;
  isActive?: boolean;
  isInStopList?: boolean;
}

export interface ReorderItemsDto {
  categoryId: string;
  itemIds: string[];
}

export interface CreateItemDto {
  name: string;
  categoryId: string;
  price: number;
  description?: string;
  imageUrl?: string;
}

export interface UpdateItemDto {
  name?: string;
  categoryId?: string;
  price?: number;
  description?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
}

@Injectable()
export class MenuCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly storage: StorageService,
  ) {}

  async listCategories(tenantId: string) {
    const categories = await this.prisma.forTenant(tenantId).menuCategory.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return categories.map((category) => this.mapCategory(category));
  }

  async createCategory(tenantId: string, dto: CreateCategoryDto) {
    this.validateName(dto.name);
    try {
      const category = await this.prisma.forTenant(tenantId).menuCategory.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          sortOrder: dto.sortOrder,
          isActive: dto.isVisible,
          posCategoryId: dto.posCategoryId,
        },
      });
      await this.invalidateMenu(tenantId);
      return this.mapCategory(category);
    } catch (e) {
      if (this.isUniqueConstraintError(e)) {
        throw new ConflictException('pos_category_id is already used by another category in this tenant');
      }
      throw e;
    }
  }

  async updateCategory(tenantId: string, categoryId: string, dto: UpdateCategoryDto) {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException('At least one field must be provided');
    }

    const data: Prisma.MenuCategoryUpdateInput = {};
    if (dto.name !== undefined) {
      this.validateName(dto.name);
      data.name = dto.name.trim();
    }
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isVisible !== undefined) data.isActive = dto.isVisible;
    if (dto.posCategoryId !== undefined) data.posCategoryId = dto.posCategoryId;

    try {
      const category = await this.prisma.forTenant(tenantId).menuCategory.update({
        where: { tenantId_id: { tenantId, id: categoryId } },
        data,
      });
      await this.invalidateMenu(tenantId);
      return this.mapCategory(category);
    } catch (e) {
      if (this.isNotFoundError(e)) {
        throw new NotFoundException(`Category ${categoryId} not found`);
      }
      if (this.isUniqueConstraintError(e)) {
        throw new ConflictException('pos_category_id is already used by another category in this tenant');
      }
      throw e;
    }
  }

  async deleteCategory(tenantId: string, categoryId: string) {
    try {
      await this.prisma.forTenant(tenantId).menuCategory.delete({
        where: { tenantId_id: { tenantId, id: categoryId } },
      });
      await this.invalidateMenu(tenantId);
    } catch (e) {
      if (this.isNotFoundError(e)) {
        throw new NotFoundException(`Category ${categoryId} not found`);
      }
      throw e;
    }
  }

  async listItems(tenantId: string, filters: ItemFilters) {
    const where: Prisma.MenuItemWhereInput = { tenantId };
    if (filters.categoryId !== undefined) where.categoryId = filters.categoryId;
    if (filters.isActive !== undefined) where.isActive = filters.isActive;
    if (filters.isInStopList !== undefined) where.isInStopList = filters.isInStopList;

    const items = await this.prisma.forTenant(tenantId).menuItem.findMany({
      where,
      orderBy: [
        { category: { sortOrder: 'asc' } },
        { sortOrder: 'asc' },
        { id: 'asc' },
      ],
    });
    return items.map((item) => this.mapItem(item));
  }

  async reorderItems(tenantId: string, dto: ReorderItemsDto): Promise<void> {
    const db = this.prisma.forTenant(tenantId);
    const existing = await db.menuItem.findMany({
      where: { tenantId, categoryId: dto.categoryId },
      select: { id: true },
    });
    const expected = new Set(existing.map((item) => item.id));
    if (dto.itemIds.length !== expected.size || new Set(dto.itemIds).size !== dto.itemIds.length || dto.itemIds.some((id) => !expected.has(id))) {
      throw new BadRequestException('itemIds must contain every item in the category exactly once');
    }
    await this.prisma.transactionForTenant(tenantId, async (tx) => {
      await Promise.all(dto.itemIds.map((id, sortOrder) => tx.menuItem.update({
        where: { tenantId_id: { tenantId, id } }, data: { sortOrder },
      })));
    });
    await this.invalidateMenu(tenantId);
  }

  async createItem(tenantId: string, dto: CreateItemDto) {
    this.validateName(dto.name);
    this.validatePrice(dto.price);
    try {
      const item = await this.prisma.transactionForTenant(tenantId, async (tx) => {
        const existing = await tx.menuItem.findMany({
          where: { tenantId, categoryId: dto.categoryId },
          select: { sortOrder: true },
        });
        const sortOrder = (existing ?? []).reduce((next, current) => Math.max(next, current.sortOrder + 1), 0);
        return tx.menuItem.create({
          data: {
            tenantId,
            name: dto.name.trim(),
            categoryId: dto.categoryId,
            priceByn: dto.price / 100,
            description: dto.description,
            imageUrl: dto.imageUrl,
            sortOrder,
          },
        });
      });
      await this.invalidateMenu(tenantId);
      return this.mapItem(item);
    } catch (e) {
      if (this.isForeignKeyError(e)) {
        throw new NotFoundException(`Category ${dto.categoryId} not found`);
      }
      throw e;
    }
  }

  async updateItem(tenantId: string, itemId: string, dto: UpdateItemDto) {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException('At least one field must be provided');
    }

    const data: Prisma.MenuItemUncheckedUpdateInput = {};
    if (dto.name !== undefined) {
      this.validateName(dto.name);
      data.name = dto.name.trim();
    }
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.price !== undefined) {
      this.validatePrice(dto.price);
      data.priceByn = dto.price / 100;
    }
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      const item = await this.prisma.forTenant(tenantId).menuItem.update({
        where: { tenantId_id: { tenantId, id: itemId } },
        data,
      });
      await this.invalidateMenu(tenantId);
      return this.mapItem(item);
    } catch (e) {
      if (this.isNotFoundError(e)) {
        throw new NotFoundException(`Item ${itemId} not found`);
      }
      if (dto.categoryId !== undefined && this.isForeignKeyError(e)) {
        throw new NotFoundException(`Category ${dto.categoryId} not found`);
      }
      throw e;
    }
  }

  async deleteItem(tenantId: string, itemId: string) {
    try {
      await this.prisma.forTenant(tenantId).menuItem.delete({
        where: { tenantId_id: { tenantId, id: itemId } },
      });
      await this.invalidateMenu(tenantId);
    } catch (e) {
      if (this.isNotFoundError(e)) {
        throw new NotFoundException(`Item ${itemId} not found`);
      }
      throw e;
    }
  }

  async presignMenuItemUpload(
    tenantId: string,
    contentType: string,
  ): Promise<{ uploadUrl: string; uploadFields: Record<string, string>; imageUrl: string }> {
    const ext = IMAGE_EXTENSION_BY_CONTENT_TYPE[contentType as keyof typeof IMAGE_EXTENSION_BY_CONTENT_TYPE];
    if (!ext) {
      throw new BadRequestException(
        `Unsupported content type "${contentType}". Allowed: ${ALLOWED_UPLOAD_CONTENT_TYPES.join(', ')}`,
      );
    }
    const key = `tenants/${tenantId}/menu/${randomUUID()}.${ext}`;
    const { uploadUrl, uploadFields, publicUrl } = await this.storage.getPresignedUploadUrl(
      key,
      contentType,
    );
    return { uploadUrl, uploadFields, imageUrl: publicUrl };
  }

  private async invalidateMenu(tenantId: string): Promise<void> {
    await this.cache.del(menuCacheKey(tenantId));
  }

  private mapCategory<T extends { isActive: boolean }>(category: T): Omit<T, 'isActive'> & { isVisible: boolean } {
    const { isActive, ...rest } = category;
    return { ...rest, isVisible: isActive };
  }

  private mapItem<T extends { priceByn: Prisma.Decimal | number }>(
    item: T,
  ): Omit<T, 'priceByn'> & { price: number } {
    const { priceByn, ...rest } = item;
    return { ...rest, price: Math.round(Number(priceByn) * 100) };
  }

  private validateName(name: string): void {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 255) {
      throw new BadRequestException('name must be between 1 and 255 characters');
    }
  }

  private validatePrice(price: number): void {
    if (!Number.isInteger(price) || price < 0) {
      throw new BadRequestException('price must be a non-negative integer in minor currency units');
    }
  }

  private isNotFoundError(e: unknown): boolean {
    return (
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025'
    );
  }

  private isUniqueConstraintError(e: unknown): boolean {
    return (
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
    );
  }

  private isForeignKeyError(e: unknown): boolean {
    return (
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003'
    );
  }
}
