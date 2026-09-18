import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersEvents } from './orders.events';
import { OrdersService } from './orders.service';

@Module({ controllers: [OrdersController], providers: [OrdersService, OrdersEvents] })
export class OrdersModule {}
