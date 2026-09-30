import { forwardRef, Module } from '@nestjs/common';
import { GuestSessionController } from './guest-session.controller';
import { GuestOrdersController } from './guest-orders.controller';
import { GuestSessionGuard } from './guest-session.guard';
import { GuestSessionService } from './guest-session.service';
import { MenuModule } from '../menu/menu.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { BepaidClient } from './bepaid.client';
import { BepaidWebhookController, BepaidWebhookService } from './bepaid-webhook';
import { EripClient } from './erip.client';
import { EripWebhookController, EripWebhookService } from './erip-webhook';

@Module({
  imports: [forwardRef(() => MenuModule), OnboardingModule],
  controllers: [GuestSessionController, GuestOrdersController, BepaidWebhookController, EripWebhookController],
  providers: [GuestSessionService, GuestSessionGuard, BepaidClient, BepaidWebhookService, EripClient, EripWebhookService],
  exports: [GuestSessionGuard],
})
export class GuestSessionModule {}
