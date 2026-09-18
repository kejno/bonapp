import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  FISCALIZE_QUEUE_NAME,
  FiscalizeJobData,
} from './fiscal-queue.types';

export const FISCAL_QUEUE = Symbol('FISCAL_QUEUE');

@Injectable()
export class FiscalService {
  private readonly logger = new Logger(FiscalService.name);

  constructor(
    @Inject(FISCAL_QUEUE) private readonly queue: Queue<FiscalizeJobData>,
    private readonly prisma: PrismaService,
  ) {}

  async enqueueFiscalization(data: FiscalizeJobData): Promise<void> {
    await this.queue.add(FISCALIZE_QUEUE_NAME, data, {
      attempts: 3,
      backoff: { type: 'custom' },
      removeOnComplete: true,
      removeOnFail: false,
    });
    this.logger.log(`Fiscalization enqueued for payment ${data.paymentId}`);
  }

  async markFiscalized(paymentId: string, receiptNumber: string): Promise<void> {
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        fiscalStatus: 'FISCALIZED',
        fiscalReceiptNumber: receiptNumber,
        fiscalizedAt: new Date(),
      },
    });
  }

  async markFiscalFailed(paymentId: string): Promise<void> {
    this.logger.error(`Payment ${paymentId} fiscal_failed after all retry attempts`);
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        fiscalStatus: 'FISCAL_FAILED',
        fiscalFailedAt: new Date(),
      },
    });
  }
}
