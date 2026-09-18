import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { Queue } from 'bullmq';
import { PaymentConfigService } from '../config/payment-config.service';
import { WEBHOOK_QUEUE } from '../queue/queue.module';

export type WebhookNewStatus = 'COMPLETED' | 'FAILED';

export interface WebhookJobData {
  provider: 'ERIP' | 'BEPAID';
  gatewayRef: string;
  newStatus: WebhookNewStatus;
  rawPayload: unknown;
}

export interface EripWebhookPayload {
  erip_order_number: string;
  status: string;
}

export interface BepaidWebhookPayload {
  transaction: { uid: string; status: string };
}

@Injectable()
export class WebhookService {
  constructor(
    private readonly config: PaymentConfigService,
    @Inject(WEBHOOK_QUEUE) private readonly queue: Queue,
  ) {}

  verifyEripSignature(signatureHeader: string, rawBody: string): boolean {
    return this.verifyHmac(signatureHeader, rawBody, this.config.eripWebhookSecret);
  }

  verifyBepaidSignature(signatureHeader: string, rawBody: string): boolean {
    return this.verifyHmac(signatureHeader, rawBody, this.config.bepaidWebhookSecret);
  }

  async enqueueEripWebhook(payload: EripWebhookPayload): Promise<void> {
    const jobData: WebhookJobData = {
      provider: 'ERIP',
      gatewayRef: payload.erip_order_number,
      newStatus: payload.status === 'CONFIRMED' ? 'COMPLETED' : 'FAILED',
      rawPayload: payload,
    };
    await this.queue.add('process-webhook', jobData, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
  }

  async enqueueBepaidWebhook(payload: BepaidWebhookPayload): Promise<void> {
    const jobData: WebhookJobData = {
      provider: 'BEPAID',
      gatewayRef: payload.transaction.uid,
      newStatus: payload.transaction.status === 'successful' ? 'COMPLETED' : 'FAILED',
      rawPayload: payload,
    };
    await this.queue.add('process-webhook', jobData, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
  }

  private verifyHmac(header: string, body: string, secret: string): boolean {
    if (!header || !header.startsWith('sha256=')) return false;
    const received = header.slice('sha256='.length);
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }
}
