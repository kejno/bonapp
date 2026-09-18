import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  RawBody,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  BepaidWebhookPayload,
  EripWebhookPayload,
} from './webhook.service';
import { WebhookService } from './webhook.service';

function toUtf8(rawBody: unknown, fallback: unknown): string {
  if (Buffer.isBuffer(rawBody)) return rawBody.toString('utf8');
  if (typeof rawBody === 'string') return rawBody;
  return JSON.stringify(fallback);
}

@Controller('api/v1/webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post('erip')
  @HttpCode(200)
  async handleEripWebhook(
    @Headers('x-erip-signature') signature: string,
    @RawBody() rawBody: unknown,
    @Body() payload: EripWebhookPayload,
  ): Promise<{ received: boolean }> {
    const bodyStr = toUtf8(rawBody, payload);
    if (!this.webhookService.verifyEripSignature(signature, bodyStr)) {
      throw new UnauthorizedException('Invalid ERIP webhook signature');
    }
    await this.webhookService.enqueueEripWebhook(payload);
    return { received: true };
  }

  @Post('bepaid')
  @HttpCode(200)
  async handleBepaidWebhook(
    @Headers('x-bepaid-signature') signature: string,
    @RawBody() rawBody: unknown,
    @Body() payload: BepaidWebhookPayload,
  ): Promise<{ received: boolean }> {
    const bodyStr = toUtf8(rawBody, payload);
    if (!this.webhookService.verifyBepaidSignature(signature, bodyStr)) {
      throw new UnauthorizedException('Invalid bePaid webhook signature');
    }
    await this.webhookService.enqueueBepaidWebhook(payload);
    return { received: true };
  }
}
