import { Module } from '@nestjs/common';
import { OplatiWebhookController } from './oplati-webhook.controller';
import { QueuesModule } from '../queues/queues.module';

@Module({
  imports: [QueuesModule],
  controllers: [OplatiWebhookController],
})
export class WebhooksModule {}
