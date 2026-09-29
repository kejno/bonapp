import { forwardRef, Module } from '@nestjs/common';
import { GuestSessionController } from './guest-session.controller';
import { GuestOrdersController } from './guest-orders.controller';
import { GuestSessionGuard } from './guest-session.guard';
import { GuestSessionService } from './guest-session.service';
import { MenuModule } from '../menu/menu.module';
import { OnboardingModule } from '../onboarding/onboarding.module';

@Module({
  imports: [forwardRef(() => MenuModule), OnboardingModule],
  controllers: [GuestSessionController, GuestOrdersController],
  providers: [GuestSessionService, GuestSessionGuard],
  exports: [GuestSessionGuard],
})
export class GuestSessionModule {}
