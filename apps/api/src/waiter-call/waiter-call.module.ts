import { Module } from '@nestjs/common';
import { GuestSessionModule } from '../guest-session/guest-session.module';
import { MenuModule } from '../menu/menu.module';
import { WaiterCallController } from './waiter-call.controller';
import { WaiterCallService } from './waiter-call.service';

@Module({
  imports: [GuestSessionModule, MenuModule],
  controllers: [WaiterCallController],
  providers: [WaiterCallService],
})
export class WaiterCallModule {}
