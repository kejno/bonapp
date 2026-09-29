import { Module } from '@nestjs/common';
import { GuestSessionGuard } from '../guest-session/guest-session.guard';
import { MenuModule } from '../menu/menu.module';
import { PaymentsService } from './payments.service';
import { GuestOrderPaymentsController, OplatiWebhookController } from './payments.controller';
import { WebhooksController } from './webhooks.controller';
import { PaymentQueue } from './payment-queue';
import { PaymentGateway } from './payment-gateway';

@Module({
  imports: [MenuModule],
  controllers: [GuestOrderPaymentsController, OplatiWebhookController, WebhooksController],
  providers: [PaymentsService, GuestSessionGuard, PaymentQueue, PaymentGateway],
})
export class PaymentsModule {}
