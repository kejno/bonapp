import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { PaymentMethodName } from './payment-gateway';

export const PROVIDER_PAYMENT_WEBHOOK_QUEUE = 'provider-payment-webhooks';

@Injectable()
export class PaymentQueue implements OnModuleInit, OnModuleDestroy {
  private connection?: Redis;
  private queue?: Queue;
  private worker?: Worker;
  private readonly logger = new Logger(PaymentQueue.name);
  private handler?: (method: PaymentMethodName, event: Record<string, unknown>) => Promise<void>;
  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) return;
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue(PROVIDER_PAYMENT_WEBHOOK_QUEUE, { connection: this.connection });
    this.worker = new Worker(PROVIDER_PAYMENT_WEBHOOK_QUEUE, async (job) => {
      if (!this.handler) throw new Error('Payment webhook handler is not registered');
      const data = job.data as { method: PaymentMethodName; event: Record<string, unknown> };
      await this.handler(data.method, data.event);
    }, { connection: this.connection.duplicate() });
    this.worker.on('failed', (job, error) => this.logger.error(`Payment webhook job ${job?.id} failed: ${error.message}`));
  }

  registerHandler(handler: (method: PaymentMethodName, event: Record<string, unknown>) => Promise<void>) { this.handler = handler; }

  async add(method: PaymentMethodName, event: Record<string, unknown>) {
    if (!this.queue) throw new Error('Payment webhook queue is unavailable');
    await this.queue.add('process', { method, event }, { jobId: webhookJobId(method, event), removeOnComplete: 1000, removeOnFail: 5000 });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }
}

function webhookJobId(method: PaymentMethodName, event: Record<string, unknown>) {
  const identity = event['id'] ?? event['eventId'] ?? event['paymentId'] ?? JSON.stringify(event);
  const value = typeof identity === 'string' || typeof identity === 'number' ? String(identity) : JSON.stringify(identity);
  return `${method}-${value.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}
