import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { AuthGuard } from '../auth/auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import type { TenantRequest } from '../auth/tenant-context.guard';
import type {
  CreateCategoryDto,
  CreateItemDto,
  ItemFilters,
  UpdateCategoryDto,
  UpdateItemDto,
} from './menu-catalog.service';
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  MenuCatalogService,
} from './menu-catalog.service';

function parseBooleanQuery(value: string | undefined): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

@Controller('admin/menu')
@UseGuards(AuthGuard, TenantContextGuard, AdminRoleGuard)
export class MenuCatalogController {
  constructor(private readonly catalogService: MenuCatalogService) {}

  @Get('categories')
  listCategories(@Req() req: TenantRequest) {
    return this.catalogService.listCategories(req.user!.tenantId!);
  }

  @Post('categories')
  createCategory(@Req() req: TenantRequest, @Body() body: unknown) {
    const dto = this.parseCreateCategory(body);
    return this.catalogService.createCategory(req.user!.tenantId!, dto);
  }

  @Put('categories/:id')
  updateCategory(
    @Req() req: TenantRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const dto = this.parseUpdateCategory(body);
    return this.catalogService.updateCategory(req.user!.tenantId!, id, dto);
  }

  @Delete('categories/:id')
  @HttpCode(204)
  deleteCategory(@Req() req: TenantRequest, @Param('id') id: string) {
    return this.catalogService.deleteCategory(req.user!.tenantId!, id);
  }

  @Get('items')
  listItems(
    @Req() req: TenantRequest,
    @Query('category') category?: string,
    @Query('is_active') isActiveQ?: string,
    @Query('is_in_stop_list') isInStopListQ?: string,
  ) {
    const filters: ItemFilters = {
      categoryId: category?.trim() || undefined,
      isActive: parseBooleanQuery(isActiveQ),
      isInStopList: parseBooleanQuery(isInStopListQ),
    };
    return this.catalogService.listItems(req.user!.tenantId!, filters);
  }

  @Post('items')
  createItem(@Req() req: TenantRequest, @Body() body: unknown) {
    const dto = this.parseCreateItem(body);
    return this.catalogService.createItem(req.user!.tenantId!, dto);
  }

  @Put('items/:id')
  updateItem(
    @Req() req: TenantRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const dto = this.parseUpdateItem(body);
    return this.catalogService.updateItem(req.user!.tenantId!, id, dto);
  }

  @Delete('items/:id')
  @HttpCode(204)
  deleteItem(@Req() req: TenantRequest, @Param('id') id: string) {
    return this.catalogService.deleteItem(req.user!.tenantId!, id);
  }

  private parseCreateCategory(body: unknown): CreateCategoryDto {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Request body must be an object');
    }
    const b = body as Record<string, unknown>;
    if (typeof b.name !== 'string') throw new BadRequestException('name is required and must be a string');
    if (typeof b.sortOrder !== 'number' || !Number.isInteger(b.sortOrder)) {
      throw new BadRequestException('sortOrder is required and must be an integer');
    }
    if (typeof b.isVisible !== 'boolean') {
      throw new BadRequestException('isVisible is required and must be a boolean');
    }
    let posCategoryId: string | undefined;
    if ('posCategoryId' in b) {
      if (b.posCategoryId !== null && typeof b.posCategoryId !== 'string') {
        throw new BadRequestException('posCategoryId must be a string or null');
      }
      posCategoryId =
        b.posCategoryId === null ? undefined : b.posCategoryId.trim() || undefined;
    }
    return {
      name: b.name,
      sortOrder: b.sortOrder,
      isVisible: b.isVisible,
      posCategoryId,
    };
  }

  private parseUpdateCategory(body: unknown): UpdateCategoryDto {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Request body must be an object');
    }
    const b = body as Record<string, unknown>;
    const dto: UpdateCategoryDto = {};
    if ('name' in b) {
      if (typeof b.name !== 'string') throw new BadRequestException('name must be a string');
      dto.name = b.name;
    }
    if ('sortOrder' in b) {
      if (typeof b.sortOrder !== 'number' || !Number.isInteger(b.sortOrder)) {
        throw new BadRequestException('sortOrder must be an integer');
      }
      dto.sortOrder = b.sortOrder;
    }
    if ('isVisible' in b) {
      if (typeof b.isVisible !== 'boolean') throw new BadRequestException('isVisible must be a boolean');
      dto.isVisible = b.isVisible;
    }
    if ('posCategoryId' in b) {
      if (b.posCategoryId !== null && typeof b.posCategoryId !== 'string') {
        throw new BadRequestException('posCategoryId must be a string or null');
      }
      dto.posCategoryId =
        b.posCategoryId === null ? null : b.posCategoryId.trim() || null;
    }
    return dto;
  }

  private parseCreateItem(body: unknown): CreateItemDto {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Request body must be an object');
    }
    const b = body as Record<string, unknown>;
    if (typeof b.name !== 'string') throw new BadRequestException('name is required and must be a string');
    if (typeof b.categoryId !== 'string' || !b.categoryId.trim()) {
      throw new BadRequestException('categoryId is required and must be a non-empty string');
    }
    if (typeof b.price !== 'number' || !Number.isInteger(b.price) || b.price < 0) {
      throw new BadRequestException('price is required and must be a non-negative integer in minor currency units');
    }
    if ('description' in b && b.description !== undefined && typeof b.description !== 'string') {
      throw new BadRequestException('description must be a string');
    }
    if ('description' in b && typeof b.description === 'string' && b.description.length > 1000) {
      throw new BadRequestException('description must be 1000 characters or fewer');
    }
    if ('imageUrl' in b && b.imageUrl !== undefined && typeof b.imageUrl !== 'string') {
      throw new BadRequestException('imageUrl must be a string');
    }
    return {
      name: b.name,
      categoryId: b.categoryId.trim(),
      price: b.price,
      description: typeof b.description === 'string' ? b.description : undefined,
      imageUrl: typeof b.imageUrl === 'string' ? b.imageUrl : undefined,
    };
  }

  private parseUpdateItem(body: unknown): UpdateItemDto {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Request body must be an object');
    }
    const b = body as Record<string, unknown>;
    const dto: UpdateItemDto = {};
    if ('name' in b) {
      if (typeof b.name !== 'string') throw new BadRequestException('name must be a string');
      dto.name = b.name;
    }
    if ('categoryId' in b) {
      if (typeof b.categoryId !== 'string' || !b.categoryId.trim()) {
        throw new BadRequestException('categoryId must be a non-empty string');
      }
      dto.categoryId = b.categoryId.trim();
    }
    if ('price' in b) {
      if (typeof b.price !== 'number' || !Number.isInteger(b.price) || b.price < 0) {
        throw new BadRequestException('price must be a non-negative integer in minor currency units');
      }
      dto.price = b.price;
    }
    if ('description' in b) {
      if (b.description !== null && typeof b.description !== 'string') {
        throw new BadRequestException('description must be a string or null');
      }
      if (typeof b.description === 'string' && b.description.length > 1000) {
        throw new BadRequestException('description must be 1000 characters or fewer');
      }
      dto.description = b.description;
    }
    if ('imageUrl' in b) {
      if (b.imageUrl !== null && typeof b.imageUrl !== 'string') {
        throw new BadRequestException('imageUrl must be a string or null');
      }
      dto.imageUrl = b.imageUrl;
    }
    if ('isActive' in b) {
      if (typeof b.isActive !== 'boolean') throw new BadRequestException('isActive must be a boolean');
      dto.isActive = b.isActive;
    }
    if ('isHit' in b) { if (typeof b.isHit !== 'boolean') throw new BadRequestException('isHit must be a boolean'); dto.isHit = b.isHit; }
    for (const field of ['costPriceByn', 'proteins', 'fats', 'carbs'] as const) {
      if (field in b) { if (b[field] !== null && (typeof b[field] !== 'number' || b[field] < 0)) throw new BadRequestException(`${field} must be a non-negative number or null`); dto[field] = b[field]; }
    }
    for (const field of ['weightGrams', 'cookingTimeMinutes', 'calories'] as const) {
      if (field in b) { if (b[field] !== null && (typeof b[field] !== 'number' || !Number.isInteger(b[field]) || b[field] < 0)) throw new BadRequestException(`${field} must be a non-negative integer or null`); dto[field] = b[field]; }
    }
    if ('kitchenDepartment' in b) { if (b.kitchenDepartment !== null && (typeof b.kitchenDepartment !== 'string' || !['HOT', 'COLD', 'BAR'].includes(b.kitchenDepartment))) throw new BadRequestException('kitchenDepartment is invalid'); dto.kitchenDepartment = b.kitchenDepartment; }
    if ('allergens' in b) { const allowed = ['GLUTEN','CRUSTACEANS','EGGS','FISH','PEANUTS','SOY','MILK','NUTS','CELERY','MUSTARD','SESAME','SULPHITES','LUPIN','MOLLUSCS']; if (!Array.isArray(b.allergens) || b.allergens.some((value) => typeof value !== 'string' || !allowed.includes(value))) throw new BadRequestException('allergens contains an invalid value'); dto.allergens = b.allergens as string[]; }
    if ('posItemId' in b) { if (b.posItemId !== null && typeof b.posItemId !== 'string') throw new BadRequestException('posItemId must be a string or null'); dto.posItemId = b.posItemId; }
    return dto;
  }
}

@Controller('admin/media')
@UseGuards(AuthGuard, TenantContextGuard, AdminRoleGuard)
export class MediaController {
  constructor(private readonly catalogService: MenuCatalogService) {}

  @Post('presign')
  presign(@Req() req: TenantRequest, @Body() body: unknown) {
    const contentType = this.parseContentType(body);
    return this.catalogService.presignMenuItemUpload(req.user!.tenantId!, contentType);
  }

  private parseContentType(body: unknown): string {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Request body must be an object');
    }
    const { contentType } = body as Record<string, unknown>;
    if (typeof contentType !== 'string' || !contentType.trim()) {
      throw new BadRequestException('contentType is required');
    }
    const normalizedContentType = contentType.trim();
    if (!ALLOWED_UPLOAD_CONTENT_TYPES.includes(normalizedContentType as typeof ALLOWED_UPLOAD_CONTENT_TYPES[number])) {
      throw new BadRequestException(
        `Unsupported content type. Allowed: ${ALLOWED_UPLOAD_CONTENT_TYPES.join(', ')}`,
      );
    }
    return normalizedContentType;
  }
}
