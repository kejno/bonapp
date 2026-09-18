import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { MenuService } from './menu.service';

@Controller('api/v1/admin/menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}
  @Get('categories') listCategories(@Headers('x-tenant-id') tenantId: string) {
    return this.menu.listCategories(this.tenant(tenantId));
  }
  @Post('categories') createCategory(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: object,
  ) {
    return this.menu.createCategory(this.tenant(tenantId), body);
  }
  @Put('categories/:id') updateCategory(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() body: object,
  ) {
    return this.menu.updateCategory(this.tenant(tenantId), id, body);
  }
  @Delete('categories/:id') @HttpCode(204) deleteCategory(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.menu.deleteCategory(this.tenant(tenantId), id);
  }
  @Get('items') listItems(
    @Headers('x-tenant-id') tenantId: string,
    @Query() query: Record<string, string>,
  ) {
    return this.menu.listItems(this.tenant(tenantId), {
      category: query.category,
      is_active: this.queryBoolean(query.is_active, 'is_active'),
      is_in_stop_list: this.queryBoolean(
        query.is_in_stop_list,
        'is_in_stop_list',
      ),
    });
  }
  @Post('items') createItem(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: object,
  ) {
    return this.menu.createItem(this.tenant(tenantId), body);
  }
  @Put('items/:id') updateItem(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() body: object,
  ) {
    return this.menu.updateItem(this.tenant(tenantId), id, body);
  }
  @Delete('items/:id') @HttpCode(204) deleteItem(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.menu.deleteItem(this.tenant(tenantId), id);
  }
  private tenant(tenantId: string) {
    if (!tenantId)
      throw new BadRequestException('x-tenant-id header is required');
    return tenantId;
  }
  private queryBoolean(value: string | undefined, field: string) {
    if (value === undefined) return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new BadRequestException(`${field} must be true or false`);
  }
}
