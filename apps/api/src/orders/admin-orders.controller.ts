import { BadRequestException, Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { OrdersService } from './orders.service';

@Controller('admin/orders')
@UseGuards(AuthGuard, TenantContextGuard, AdminRoleGuard)
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('active')
  findActive() {
    return this.ordersService.findActive();
  }

  @Patch(':orderId/status')
  changeStatus(@Param('orderId') id: string, @Body() body: unknown) {
    if (typeof body !== 'object' || body === null || typeof (body as Record<string, unknown>)['status'] !== 'string' || !Object.values(OrderStatus).includes((body as { status: OrderStatus }).status)) {
      throw new BadRequestException('status is invalid');
    }
    return this.ordersService.changeStatus(id, (body as { status: OrderStatus }).status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }
}
