import { IsEnum } from 'class-validator';
import { OrderStatus } from '../entities/order.entity.js';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
