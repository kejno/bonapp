import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { MenuService } from './menu.service';
import type {
  CreateModifierGroupDto,
  CreateModifierOptionDto,
  UpdateModifierGroupDto,
  UpdateModifierOptionDto,
} from './menu.types';

@Controller('api/v1')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get('admin/menu/items/:itemId/modifier-groups')
  listGroups(
    @Headers('x-tenant-id') tenantId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.menuService.listGroups(this.requireTenantId(tenantId), itemId);
  }

  @Post('admin/menu/items/:itemId/modifier-groups')
  createGroup(
    @Headers('x-tenant-id') tenantId: string,
    @Param('itemId') itemId: string,
    @Body() dto: CreateModifierGroupDto,
  ) {
    return this.menuService.createGroup(
      this.requireTenantId(tenantId),
      itemId,
      dto,
    );
  }

  @Put('admin/menu/modifier-groups/:id')
  updateGroup(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateModifierGroupDto,
  ) {
    return this.menuService.updateGroup(
      this.requireTenantId(tenantId),
      id,
      dto,
    );
  }

  @Delete('admin/menu/modifier-groups/:id')
  deleteGroup(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.menuService.deleteGroup(this.requireTenantId(tenantId), id);
  }

  @Post('admin/menu/modifier-groups/:id/options')
  createOption(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateModifierOptionDto,
  ) {
    return this.menuService.createOption(
      this.requireTenantId(tenantId),
      id,
      dto,
    );
  }

  @Put('admin/menu/modifier-options/:id')
  updateOption(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateModifierOptionDto,
  ) {
    return this.menuService.updateOption(
      this.requireTenantId(tenantId),
      id,
      dto,
    );
  }

  @Delete('admin/menu/modifier-options/:id')
  deleteOption(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.menuService.deleteOption(this.requireTenantId(tenantId), id);
  }

  @Patch('admin/menu/items/:itemId/stop-list')
  updateStopList(
    @Headers('x-tenant-id') tenantId: string,
    @Param('itemId') itemId: string,
    @Body('is_in_stop_list') isInStopList: boolean,
  ) {
    if (typeof isInStopList !== 'boolean') {
      throw new BadRequestException('is_in_stop_list must be a boolean');
    }
    return this.menuService.updateStopList(
      this.requireTenantId(tenantId),
      itemId,
      isInStopList,
    );
  }

  @Get('guest/menu')
  getGuestMenu(@Headers('x-tenant-id') tenantId: string) {
    return this.menuService.getGuestMenu(this.requireTenantId(tenantId));
  }

  private requireTenantId(tenantId: string) {
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    return tenantId;
  }
}
