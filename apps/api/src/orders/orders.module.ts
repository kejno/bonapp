import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WelcomeModule } from '../welcome/welcome.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule, WelcomeModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
