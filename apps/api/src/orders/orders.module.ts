import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { MenuModule } from '../menu/menu.module';
import { AdminOrdersController } from './admin-orders.controller';

@Module({
  imports: [AuthModule, forwardRef(() => MenuModule)],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
