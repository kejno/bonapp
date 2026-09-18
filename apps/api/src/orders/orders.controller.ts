import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';

@Controller('api/v1/admin/orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('active')
  findActive(@Headers('x-tenant-id') tenantId: string) { return this.orders.findActive(requiredTenant(tenantId)); }

  @Get(':id')
  findOne(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) { return this.orders.findOne(requiredTenant(tenantId), id); }

  @Post()
  create(@Headers('x-tenant-id') tenantId: string, @Body() body: { phone: string; tableId?: string; items: Array<{ menuItemId: string; quantity: number }> }) {
    return this.orders.create(requiredTenant(tenantId), body);
  }

  @Patch(':orderId/status')
  changeStatus(@Headers('x-tenant-id') tenantId: string, @Param('orderId') orderId: string, @Body('status') status: OrderStatus) {
    return this.orders.changeStatus(requiredTenant(tenantId), orderId, status);
  }
}

function requiredTenant(tenantId: string) {
  if (!tenantId) throw new BadRequestException('Заголовок x-tenant-id обязателен');
  return tenantId;
}
