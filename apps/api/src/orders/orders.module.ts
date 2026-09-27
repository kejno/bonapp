import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WelcomeModule } from '../welcome/welcome.module';
import { OrdersController } from './orders.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersService } from './orders.service';
import { MenuModule } from '../menu/menu.module';

@Module({
  imports: [AuthModule, WelcomeModule, forwardRef(() => MenuModule)],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
