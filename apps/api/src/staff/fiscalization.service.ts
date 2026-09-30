import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { FiscalizationStatus, PaymentStatus } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { decryptCredentials, isEncryptedCredentials } from '../tenant/payment-credentials';
import { SKNO_FISCAL_CLIENT } from './skno-client';
import type { SknoFiscalClient, SknoCredentials } from './skno-client';

interface FiscalizationJob { tenantId: string; paymentId: string }
const QUEUE_NAME = 'fiscalize-payment';

@Injectable()
export class FiscalizationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FiscalizationService.name);
  private readonly queue: Queue<FiscalizationJob>;
  private readonly worker: Worker<FiscalizationJob>;

  constructor(private readonly prisma: PrismaService, @Inject(SKNO_FISCAL_CLIENT) private readonly skno: SknoFiscalClient) {
    const connection = { host: process.env.REDIS_HOST ?? 'localhost', port: Number(process.env.REDIS_PORT ?? 6379) };
    this.queue = new Queue<FiscalizationJob>(QUEUE_NAME, { connection });
    this.worker = new Worker<FiscalizationJob>(QUEUE_NAME, (job) => this.process(job), {
      connection,
      settings: { backoffStrategy: (attemptsMade, type) => type === 'fiscalization' ? ([5000, 30000][attemptsMade - 1] ?? -1) : -1 },
    });
    this.worker.on('failed', (job, error) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) void this.markFailed(job.data, error);
    });
  }

  async onModuleInit() { await this.worker.waitUntilReady(); }
  async onModuleDestroy() { await this.worker.close(); await this.queue.close(); }

  async enqueue(tenantId: string, paymentId: string): Promise<void> {
    const jobId = `fiscalize-${tenantId}-${paymentId}`;
    const existingJob = await this.queue.getJob(jobId);
    if (existingJob && await existingJob.getState() === 'failed') await existingJob.remove();
    await this.prisma.transactionForTenant(tenantId, (tx) => tx.payment.updateMany({
      where: { id: paymentId, tenantId, status: { in: [PaymentStatus.SUCCEEDED, PaymentStatus.COMPLETED] } },
      data: { fiscalizationStatus: FiscalizationStatus.PENDING },
    }));
    await this.queue.add(QUEUE_NAME, { tenantId, paymentId }, {
      jobId,
      attempts: 3,
      backoff: { type: 'fiscalization', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  private async process(job: Job<FiscalizationJob>): Promise<void> {
    const { tenantId, paymentId } = job.data;
    const payment = await this.prisma.forTenant(tenantId).payment.findFirst({
      where: { id: paymentId, tenantId, status: { in: [PaymentStatus.SUCCEEDED, PaymentStatus.COMPLETED] } },
      include: { order: { include: { items: true } } },
    });
    if (!payment || payment.fiscalReceiptNumber) return;
    const credentials = await this.getCredentials(tenantId);
    const menuItems = await this.prisma.db.menuItem.findMany({
      where: { tenantId, id: { in: payment.order.items.map((item) => item.itemId) } },
      select: { id: true, name: true },
    });
    const names = new Map(menuItems.map((item) => [item.id, item.name]));
    const receiptNumber = await this.skno.issueReceipt(credentials, {
      paymentId,
      amount: Number(payment.amountByn),
      items: payment.order.items.map((item) => ({ name: names.get(item.itemId) ?? item.itemId, quantity: item.quantity, price: Number(item.unitPriceByn) })),
    });
    await this.prisma.forTenant(tenantId).payment.update({
      where: { id: paymentId },
      data: { fiscalReceiptNumber: receiptNumber, fiscalizationStatus: FiscalizationStatus.FISCALIZED },
    });
  }

  private async getCredentials(tenantId: string): Promise<SknoCredentials & { unp?: string }> {
    const tenant = await this.prisma.db.tenant.findUnique({ where: { id: tenantId }, select: { paymentCredentials: true } });
    const encoded = (tenant?.paymentCredentials as Record<string, unknown> | null)?.skno;
    const secret = process.env.PAYMENT_CREDENTIALS_SECRET;
    if (!isEncryptedCredentials(encoded) || !secret) throw new Error('Не настроены реквизиты СКНО');
    const value = decryptCredentials<{ cashRegisterSerial: string; host: string; username: string; password: string; unp?: string }>(encoded, secret);
    if (!value.host || !value.username || value.password === undefined || !value.cashRegisterSerial || !value.unp || !/^\d{9}$/.test(value.unp)) throw new Error('Для фискализации укажите серийный номер кассы, корректный УНП и реквизиты подключения СКНО');
    let host: URL;
    try { host = new URL(value.host); } catch { throw new Error('Некорректный адрес кассы СКНО'); }
    if (!['http:', 'https:'].includes(host.protocol) || host.username || host.password) throw new Error('Некорректный адрес кассы СКНО');
    return { ...value, host: host.toString() };
  }

  private async markFailed(data: FiscalizationJob, error: Error): Promise<void> {
    await this.prisma.forTenant(data.tenantId).payment.updateMany({
      where: { id: data.paymentId, fiscalReceiptNumber: null },
      data: { fiscalizationStatus: FiscalizationStatus.FISCAL_FAILED },
    }).catch((updateError: unknown) => this.logger.error('Не удалось сохранить статус ошибки фискализации', updateError instanceof Error ? updateError.stack : undefined));
    this.logger.error(`Фискализация платежа ${data.paymentId} исчерпала три попытки`, error.stack);
  }
}
