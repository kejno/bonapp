import { Body, Controller, Post } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrderService } from './order.service.js';

@Controller('public/orders')
export class PublicOrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orderService.createPublic(dto);
  }
}
