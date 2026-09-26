import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { OrdersService } from './orders.service';
import { MenuGateway } from '../menu/menu.gateway';

@Controller('orders')
@UseGuards(AuthGuard, TenantContextGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly menuGateway: MenuGateway,
  ) {}

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
    return this.ordersService.create((body as { tableId: string }).tableId.trim()).then((order) => {
      this.menuGateway.emitOrderCreated(order.tenantId, order);
      return order;
    });
  }

  @Post(':id/pay')
  @UseGuards(AdminRoleGuard)
  @HttpCode(200)
  async pay(@Param('id') id: string) {
    const order = await this.ordersService.pay(id);
    this.menuGateway.emitOrderStatusChanged(order.tenantId, order.id, order.status);
    await this.menuGateway.closeOrderSession(order.tenantId, order.tableId, order.id);
    return order;
  }

  @Get()
  findAll() {
    return this.ordersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }
}
