import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../identity/entities/tenant.entity.js';
import { MenuCategory } from './entities/menu-category.entity.js';
import { MenuItem } from './entities/menu-item.entity.js';
import { MenuCategoryController } from './menu-category.controller.js';
import { MenuCategoryService } from './menu-category.service.js';
import { MenuItemController } from './menu-item.controller.js';
import { MenuItemService } from './menu-item.service.js';
import { PublicMenuController } from './public-menu.controller.js';
import { PublicMenuService } from './public-menu.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([MenuCategory, MenuItem, Tenant])],
  controllers: [MenuCategoryController, MenuItemController, PublicMenuController],
  providers: [MenuCategoryService, MenuItemService, PublicMenuService],
})
export class MenuModule {}
