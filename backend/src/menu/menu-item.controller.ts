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
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../identity/decorators/current-user.decorator.js';
import { Roles } from '../identity/decorators/roles.decorator.js';
import { Role } from '../identity/entities/user.entity.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { CreateMenuItemDto } from './dto/create-menu-item.dto.js';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto.js';
import { MenuItemService } from './menu-item.service.js';

@Controller('menu/items')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.STAFF)
export class MenuItemController {
  constructor(private readonly service: MenuItemService) {}

  @Get()
  getItems(
    @CurrentUser() user: { tenantId: string },
    @Query('categoryId') categoryId?: string,
  ) {
    return this.service.getItems(user.tenantId, categoryId);
  }

  @Post()
  createItem(
    @CurrentUser() user: { tenantId: string },
    @Body() dto: CreateMenuItemDto,
  ) {
    return this.service.createItem(user.tenantId, dto);
  }

  @Patch(':id')
  updateItem(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.service.updateItem(user.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteItem(@CurrentUser() user: { tenantId: string }, @Param('id') id: string) {
    return this.service.deleteItem(user.tenantId, id);
  }
}
