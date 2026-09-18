import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersEvents } from './orders.events';

@Module({ controllers: [OrdersController], providers: [OrdersService, OrdersEvents], exports: [OrdersEvents] })
export class OrdersModule {}
