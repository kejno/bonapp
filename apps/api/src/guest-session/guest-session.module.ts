import { Module } from '@nestjs/common';
import { GuestSessionController } from './guest-session.controller';
import { GuestSessionGuard } from './guest-session.guard';
import { GuestSessionService } from './guest-session.service';

@Module({
  controllers: [GuestSessionController],
  providers: [GuestSessionService, GuestSessionGuard],
  exports: [GuestSessionGuard],
})
export class GuestSessionModule {}
