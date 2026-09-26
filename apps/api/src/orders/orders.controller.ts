import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { OrdersService } from './orders.service';
import { OrderStatus } from '@prisma/client';
import { MenuGateway } from '../menu/menu.gateway';

@Controller('orders')
@UseGuards(AuthGuard, TenantContextGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService, private readonly menuGateway: MenuGateway) {}

  @Post()
  create(@Body() body: unknown) {
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as Record<string, unknown>)['tableId'] !== 'string' ||
      !(body as Record<string, string>)['tableId'].trim()
    ) {
      throw new BadRequestException('tableId is required');
    }
    return this.ordersService.create((body as { tableId: string }).tableId.trim());
  }

  @Post(':id/pay')
  @UseGuards(AdminRoleGuard)
  @HttpCode(200)
  pay(@Param('id') id: string) {
    return this.ordersService.pay(id);
  }

  @Get()
  findAll() {
    return this.ordersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/status')
  @UseGuards(AdminRoleGuard)
  async updateStatus(@Param('id') id: string, @Body() body: unknown) {
    const status = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['status'] : undefined;
    if (typeof status !== 'string' || !Object.values(OrderStatus).includes(status as OrderStatus)) {
      throw new BadRequestException('Valid order status is required');
    }
    const order = await this.ordersService.updateStatus(id, status as OrderStatus);
    this.menuGateway.emitOrderStatusChanged(order);
    return order;
  }
}
