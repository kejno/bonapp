import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { REDIS_CONNECTION, WEBHOOK_QUEUE_NAME } from '../queue/queue.module';
import { PrismaService } from '../prisma/prisma.service';
import { SocketService } from '../socket/socket.service';
import { WebhookJobData } from './webhook.service';

@Injectable()
export class WebhookConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookConsumer.name);
  private worker!: Worker;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
    private readonly prisma: PrismaService,
    private readonly socketService: SocketService,
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      WEBHOOK_QUEUE_NAME,
      (job: Job<WebhookJobData>) => this.processJob(job),
      { connection: this.redis },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker.close();
  }

  async processJob(job: Job<WebhookJobData>): Promise<void> {
    const { gatewayRef, newStatus, rawPayload } = job.data;

    const payment = await this.prisma.payment.findFirst({
      where: { gatewayRef },
      include: { order: true },
    });

    if (!payment) {
      this.logger.warn(`No payment found for gatewayRef=${gatewayRef}, skipping`);
      return;
    }

    if (payment.status !== PaymentStatus.PENDING) {
      this.logger.log(
        `Payment ${payment.id} already ${payment.status}, skipping duplicate webhook`,
      );
      return;
    }

    const targetStatus =
      newStatus === 'COMPLETED' ? PaymentStatus.COMPLETED : PaymentStatus.FAILED;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: targetStatus, webhookPayload: rawPayload as object },
    });

    if (targetStatus === PaymentStatus.COMPLETED) {
      await this.prisma.order.update({
        where: { id: payment.orderId },
        data: { is_paid: true },
      });
    }

    const wsPayload = {
      orderId: payment.orderId,
      paymentId: payment.id,
      status: newStatus,
      method: payment.method,
    };

    this.socketService.emitToRoom(
      `tenant:${payment.order.tenantId}`,
      'payment.status_changed',
      wsPayload,
    );
    this.socketService.emitToRoom(
      `table:${payment.order.tableSessionId}`,
      'payment.status_changed',
      wsPayload,
    );
  }
}
