import { Module, forwardRef } from '@nestjs/common';
import { MenuModule } from '../menu/menu.module';
import { GuestSessionModule } from '../guest-session/guest-session.module';
import { PaymentGateway } from './payment-gateway';
import { PaymentQueue } from './payment-queue';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { WebhooksController } from './webhooks.controller';

@Module({ imports: [forwardRef(() => MenuModule), forwardRef(() => GuestSessionModule)], controllers: [PaymentsController, WebhooksController], providers: [PaymentGateway, PaymentQueue, PaymentsService], exports: [PaymentsService] })
export class PaymentsModule {}
