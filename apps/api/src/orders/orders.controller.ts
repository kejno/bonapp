import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import type { OrderStatus } from '@bonapp/shared-types';
import { OrdersGateway } from './orders.gateway';
import { OrdersService } from './orders.service';

@Controller('api/orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly ordersGateway: OrdersGateway,
  ) {}

  @Get(':orderId')
  findOne(@Param('orderId') orderId: string) {
    return this.ordersService.findSnapshot(orderId);
  }

  @Patch(':orderId/status')
  async updateStatus(
    @Param('orderId') orderId: string,
    @Body('status') status: OrderStatus,
  ) {
    const order = await this.ordersService.updateStatus(orderId, status);
    this.ordersGateway.publishStatusChanged(order);
    return order;
  }
}
