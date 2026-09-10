import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../identity/decorators/current-user.decorator.js';
import { Roles } from '../identity/decorators/roles.decorator.js';
import { Role } from '../identity/entities/user.entity.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { CreateMenuCategoryDto } from './dto/create-menu-category.dto.js';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto.js';
import { MenuCategoryService } from './menu-category.service.js';

@Controller('menu/categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.STAFF)
export class MenuCategoryController {
  constructor(private readonly service: MenuCategoryService) {}

  @Get()
  getCategories(@CurrentUser() user: { tenantId: string }) {
    return this.service.getCategories(user.tenantId);
  }

  @Post()
  createCategory(
    @CurrentUser() user: { tenantId: string },
    @Body() dto: CreateMenuCategoryDto,
  ) {
    return this.service.createCategory(user.tenantId, dto);
  }

  @Patch(':id')
  updateCategory(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
    @Body() dto: UpdateMenuCategoryDto,
  ) {
    return this.service.updateCategory(user.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCategory(@CurrentUser() user: { tenantId: string }, @Param('id') id: string) {
    return this.service.deleteCategory(user.tenantId, id);
  }
}
