import { Inject, Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { FiscalizeJobData } from './fiscal-queue.types';
import {
  ISknoApiService,
  SKNO_API_SERVICE,
} from './skno/skno-api.interface';
import { FiscalService } from './fiscal.service';

@Injectable()
export class FiscalProcessor {
  private readonly logger = new Logger(FiscalProcessor.name);

  constructor(
    @Inject(SKNO_API_SERVICE) private readonly sknoApi: ISknoApiService,
    private readonly prisma: PrismaService,
    private readonly fiscalService: FiscalService,
  ) {}

  async process(job: Job<FiscalizeJobData>): Promise<void> {
    const { paymentId, tenantId, orderId, amount } = job.data;
    this.logger.log(`Processing fiscalization for payment ${paymentId} (attempt ${job.attemptsMade + 1})`);

    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
    });
    if (!settings) {
      throw new Error(`TenantSettings not found for tenant ${tenantId}`);
    }

    const receiptNumber = await this.sknoApi.fiscalizePayment({
      paymentId,
      tenantId,
      orderId,
      amount,
      sknoSerial: settings.sknoSerial,
      sknoUnp: settings.sknoUnp,
    });

    await this.fiscalService.markFiscalized(paymentId, receiptNumber);
    this.logger.log(`Payment ${paymentId} fiscalized, receipt: ${receiptNumber}`);
  }

  async onJobFailed(job: Job<FiscalizeJobData> | undefined, err: Error): Promise<void> {
    if (!job) return;
    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (isLastAttempt) {
      this.logger.error(`Payment ${job.data.paymentId} fiscal_failed: ${err.message}`);
      await this.fiscalService.markFiscalFailed(job.data.paymentId);
    }
  }
}
