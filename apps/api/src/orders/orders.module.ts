import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { MenuModule } from '../menu/menu.module';

@Module({
  imports: [AuthModule, forwardRef(() => MenuModule)],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
