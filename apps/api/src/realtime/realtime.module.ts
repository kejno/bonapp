import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrdersController } from './orders.controller';
import { RealtimeGateway } from './realtime.gateway';
import { StaffAuthService } from './staff-auth.service';
import { TableSessionService } from './table-session.service';

@Module({
  controllers: [OrdersController],
  providers: [
    RealtimeGateway,
    TableSessionService,
    StaffAuthService,
    OrderService,
  ],
  exports: [RealtimeGateway, OrderService],
})
export class RealtimeModule {}
