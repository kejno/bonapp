import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PaymentWebhookConsumer } from './payment-webhook.consumer';
import { PaymentModule } from '../payment/payment.module';

export const PAYMENT_WEBHOOKS_QUEUE = 'PAYMENT_WEBHOOKS_QUEUE';

@Module({
  imports: [PaymentModule],
  providers: [
    {
      provide: PAYMENT_WEBHOOKS_QUEUE,
      useFactory: (config: ConfigService) =>
        new Queue('payment-webhooks', {
          connection: {
            host: config.get('REDIS_HOST', 'localhost'),
            port: config.get<number>('REDIS_PORT', 6379),
          },
        }),
      inject: [ConfigService],
    },
    PaymentWebhookConsumer,
  ],
  exports: [PAYMENT_WEBHOOKS_QUEUE],
})
export class QueuesModule {}
