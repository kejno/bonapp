import {
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { verifyOplatiSignature } from './oplati-hmac';
import { PAYMENT_WEBHOOKS_QUEUE } from '../queues/queues.module';

@Controller('api/v1/webhooks')
export class OplatiWebhookController {
  constructor(
    private readonly config: ConfigService,
    @Inject(PAYMENT_WEBHOOKS_QUEUE) private readonly queue: Queue,
  ) {}

  @Post('oplati')
  @HttpCode(200)
  async handleOplatiWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-oplati-signature') signature: string,
  ): Promise<void> {
    const rawBody = req.rawBody as Buffer;
    return this.processWebhook(rawBody, signature);
  }

  async processWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const webhookSecret = this.config.getOrThrow('OPLATI_WEBHOOK_SECRET');
    if (
      !signature ||
      !verifyOplatiSignature(rawBody, signature, webhookSecret)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const payload = JSON.parse(rawBody.toString()) as { paymentId: string };

    await this.queue.add(
      'confirm-payment',
      { externalId: payload.paymentId },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    );
  }
}
