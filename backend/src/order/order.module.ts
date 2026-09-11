import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenuItem } from '../menu/entities/menu-item.entity.js';
import { Table } from '../table/entities/table.entity.js';
import { IdentityModule } from '../identity/identity.module.js';
import { OrderController } from './order.controller.js';
import { Order } from './entities/order.entity.js';
import { OrderService } from './order.service.js';
import { PublicOrderController } from './public-order.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Table, MenuItem]),
    IdentityModule,
  ],
  controllers: [OrderController, PublicOrderController],
  providers: [OrderService],
  exports: [TypeOrmModule],
})
export class OrderModule {}
