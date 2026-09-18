import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { OrdersService } from './orders.service';
import type { CreateOrderInput } from './orders.service';

@Controller('api/v1/guest/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() input: CreateOrderInput) {
    return this.ordersService.create(input);
  }
}
