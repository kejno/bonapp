import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { PaymentService } from '../payment/payment.service';

export interface PaymentWebhookJobData {
  externalId: string;
}

@Injectable()
export class PaymentWebhookConsumer implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null;

  constructor(
    private readonly paymentService: PaymentService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<PaymentWebhookJobData>(
      'payment-webhooks',
      (job) => this.process(job),
      {
        connection: {
          host: this.config.get('REDIS_HOST', 'localhost'),
          port: this.config.get<number>('REDIS_PORT', 6379),
        },
      },
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  async process(job: Job<PaymentWebhookJobData>): Promise<void> {
    await this.paymentService.processWebhookConfirmation(job.data.externalId);
  }
}
