import { Module } from '@nestjs/common';
import { GuestSessionGuard } from '../guest-session/guest-session.guard';
import { MenuModule } from '../menu/menu.module';
import { PaymentsService } from './payments.service';
import { GuestOrderPaymentsController, OplatiWebhookController } from './payments.controller';

@Module({
  imports: [MenuModule],
  controllers: [GuestOrderPaymentsController, OplatiWebhookController],
  providers: [PaymentsService, GuestSessionGuard],
})
export class PaymentsModule {}
