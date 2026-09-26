import { Module } from '@nestjs/common';
import { GuestSessionController } from './guest-session.controller';
import { GuestOrdersController } from './guest-orders.controller';
import { GuestSessionGuard } from './guest-session.guard';
import { GuestSessionService } from './guest-session.service';

@Module({
  controllers: [GuestSessionController, GuestOrdersController],
  providers: [GuestSessionService, GuestSessionGuard],
  exports: [GuestSessionGuard],
})
export class GuestSessionModule {}
