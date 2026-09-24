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

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
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
    return this.prisma.forTenant(tenantId).menuCategory.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  async createCategory(tenantId: string, dto: CreateCategoryDto) {
    this.validateCategoryName(dto.name);
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
      return category;
    } catch (e) {
      if (this.isUniqueConstraintError(e)) {
        throw new ConflictException('pos_category_id is already used by another category in this tenant');
      }
      throw e;
    }
  }

  async updateCategory(tenantId: string, categoryId: string, dto: UpdateCategoryDto) {
    const data: Prisma.MenuCategoryUpdateInput = {};
    if (dto.name !== undefined) {
      this.validateCategoryName(dto.name);
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
      return category;
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

    return this.prisma.forTenant(tenantId).menuItem.findMany({
      where,
      orderBy: [
        { category: { sortOrder: 'asc' } },
        { name: 'asc' },
        { id: 'asc' },
      ],
    });
  }

  async createItem(tenantId: string, dto: CreateItemDto) {
    this.validateItemName(dto.name);
    this.validatePrice(dto.price);
    try {
      const item = await this.prisma.forTenant(tenantId).menuItem.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          categoryId: dto.categoryId,
          priceByn: dto.price / 100,
          description: dto.description,
          imageUrl: dto.imageUrl,
        },
      });
      await this.invalidateMenu(tenantId);
      return item;
    } catch (e) {
      if (this.isForeignKeyError(e)) {
        throw new NotFoundException(`Category ${dto.categoryId} not found`);
      }
      throw e;
    }
  }

  async updateItem(tenantId: string, itemId: string, dto: UpdateItemDto) {
    const data: Prisma.MenuItemUncheckedUpdateInput = {};
    if (dto.name !== undefined) {
      this.validateItemName(dto.name);
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
      return item;
    } catch (e) {
      if (this.isNotFoundError(e)) {
        throw new NotFoundException(`Item ${itemId} not found`);
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
  ): Promise<{ uploadUrl: string; imageUrl: string }> {
    const ext = ALLOWED_IMAGE_TYPES[contentType];
    if (!ext) {
      throw new BadRequestException(
        `Unsupported content type "${contentType}". Allowed: ${Object.keys(ALLOWED_IMAGE_TYPES).join(', ')}`,
      );
    }
    const key = `tenants/${tenantId}/menu/${randomUUID()}.${ext}`;
    const { uploadUrl, publicUrl } = await this.storage.getPresignedUploadUrl(key, contentType, 600);
    return { uploadUrl, imageUrl: publicUrl };
  }

  private async invalidateMenu(tenantId: string): Promise<void> {
    await this.cache.del(menuCacheKey(tenantId));
  }

  private validateCategoryName(name: string): void {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 255) {
      throw new BadRequestException('name must be between 1 and 255 characters');
    }
  }

  private validateItemName(name: string): void {
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
