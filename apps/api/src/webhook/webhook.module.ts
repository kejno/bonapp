import { Module } from '@nestjs/common';
import { PaymentConfigService } from '../config/payment-config.service';
import { WebhookConsumer } from './webhook.consumer';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  controllers: [WebhookController],
  providers: [WebhookService, WebhookConsumer, PaymentConfigService],
})
export class WebhookModule {}
