import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { MenuModule } from '../menu/menu.module';
import { AdminOrdersController } from './admin-orders.controller';

@Module({
  imports: [AuthModule, MenuModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
