import { createHash } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { MenuGateway } from '../menu/menu.gateway';
import { decryptCredentials, EncryptedCredentials } from '../tenant/payment-credentials';
import { verifyOplatiSignature } from './oplati-webhook-signature';

interface PaymentWebhook { providerTransactionId: string; eventId?: string; status: string }
interface PaymentJob { body: PaymentWebhook }
interface OplatiResponse { paymentId: string; qrCodeData: string; deepLink: string; eripCode?: string }

@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly queue: Queue<PaymentJob>;
  private readonly worker: Worker<PaymentJob>;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly gateway: MenuGateway) {
    const connection = { host: config.get<string>('REDIS_HOST', 'localhost'), port: Number(config.get<string>('REDIS_PORT', '6379')) };
    this.queue = new Queue<PaymentJob>('payment-webhooks', { connection });
    this.worker = new Worker<PaymentJob>('payment-webhooks', (job) => this.processWebhook(job), { connection });
    this.worker.on('failed', (job, error) => this.logger.error(`Payment webhook job ${job?.id ?? 'unknown'} failed: ${error.message}`));
  }

  async onModuleInit(): Promise<void> { await this.worker.waitUntilReady(); }
  async onModuleDestroy(): Promise<void> { await this.worker.close(); await this.queue.close(); }

  async createOplatiPayment(tenantId: string, tableId: string, orderId: string, tipsAmountByn: number) {
    const db = this.prisma.forTenant(tenantId);
    const order = await db.order.findFirst({ where: { id: orderId, tableId, isPaid: false }, select: { id: true, totalAmountByn: true, tipsAmountByn: true } });
    if (!order) throw new NotFoundException('Order not found');
    const orderAmount = Number(order.totalAmountByn);
    const totalWithTipsByn = Number((orderAmount + tipsAmountByn).toFixed(2));
    if (!Number.isFinite(totalWithTipsByn) || totalWithTipsByn <= 0) throw new BadRequestException('Payment amount must be positive');

    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { paymentCredentials: true } });
    const stored = tenant?.paymentCredentials as Record<string, EncryptedCredentials> | null;
    const encrypted = stored?.['oplati'];
    const encryptionSecret = this.config.get<string>('PAYMENT_CREDENTIALS_SECRET');
    if (!encrypted || !encryptionSecret) throw new ServiceUnavailableException('Оплати™ не настроен для арендатора');
    let credentials: { gateway: string; merchantId: string };
    try { credentials = decryptCredentials(encrypted, encryptionSecret); } catch { throw new ServiceUnavailableException('Не удалось прочитать реквизиты Оплати™'); }
    const apiUrl = this.config.get<string>('OPLATI_API_URL');
    const callbackUrl = this.config.get<string>('OPLATI_CALLBACK_URL');
    if (!apiUrl || !callbackUrl) throw new ServiceUnavailableException('Не настроен API-контракт Оплати™');

    let response: Response;
    try {
      response = await fetch(apiUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ merchantId: credentials.merchantId, orderId, amount: totalWithTipsByn, currency: 'BYN', callbackUrl }), signal: AbortSignal.timeout(10_000) });
    } catch { throw new ServiceUnavailableException('Оплати™ временно недоступен'); }
    if (!response.ok) throw new ServiceUnavailableException('Оплати™ отклонил создание платежа');
    const provider = await response.json() as Partial<OplatiResponse>;
    if (typeof provider.paymentId !== 'string' || typeof provider.qrCodeData !== 'string' || typeof provider.deepLink !== 'string') {
      throw new ServiceUnavailableException('Оплати™ вернул некорректный ответ');
    }
    const payment = await db.payment.create({ data: { orderId, tenantId, amountByn: orderAmount, tipsAmountByn, provider: 'OPLATI', providerTransactionId: provider.paymentId, eripOrderNumber: provider.eripCode ?? null, status: PaymentStatus.PENDING, payload: { qrCodeData: provider.qrCodeData, deepLink: provider.deepLink } }, select: { id: true } });
    return { paymentId: payment.id, qrCodeData: provider.qrCodeData, deepLink: provider.deepLink, eripCode: provider.eripCode ?? null, totalWithTipsByn };
  }

  async acceptWebhook(rawBody: Buffer | undefined, headers: Record<string, string | string[] | undefined>) {
    const signatureHeader = this.config.get<string>('OPLATI_WEBHOOK_SIGNATURE_HEADER');
    const secret = this.config.get<string>('OPLATI_WEBHOOK_SECRET');
    const algorithm = this.config.get<string>('OPLATI_WEBHOOK_HMAC_ALGORITHM');
    if (!rawBody || !signatureHeader || !secret || !algorithm) throw new ServiceUnavailableException('Верификация вебхука Оплати™ не настроена');
    const value = headers[signatureHeader.toLowerCase()];
    const signature = Array.isArray(value) ? value[0] : value;
    if (typeof signature !== 'string' || !verifyOplatiSignature(rawBody, signature, secret, algorithm)) throw new UnauthorizedException('Недействительная подпись Оплати™');
    let body: PaymentWebhook;
    try { body = JSON.parse(rawBody.toString('utf8')) as PaymentWebhook; } catch { throw new BadRequestException('Некорректное тело вебхука'); }
    if (!body || typeof body.providerTransactionId !== 'string' || typeof body.status !== 'string') throw new BadRequestException('В вебхуке отсутствуют обязательные поля');
    const jobId = createHash('sha256').update(body.eventId ?? body.providerTransactionId).digest('hex');
    await this.queue.add('oplati-payment-update', { body }, { jobId, attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 1000 });
    return { accepted: true };
  }

  private async processWebhook(job: Job<PaymentJob>): Promise<void> {
    const event = job.data.body;
    if (event.status !== 'COMPLETED' && event.status !== 'SUCCESS') return;
    const payment = await this.prisma.unscopedClient.payment.findFirst({ where: { provider: 'OPLATI', providerTransactionId: event.providerTransactionId }, select: { id: true, tenantId: true, orderId: true, status: true } });
    if (!payment || payment.status !== PaymentStatus.PENDING) return;
    const changed = await this.prisma.transactionForTenant(payment.tenantId, async (tx) => {
      const updated = await tx.payment.updateMany({ where: { id: payment.id, status: PaymentStatus.PENDING }, data: { status: PaymentStatus.SUCCEEDED } });
      if (updated.count !== 1) return false;
      await tx.order.update({ where: { id_tenantId: { id: payment.orderId, tenantId: payment.tenantId } }, data: { isPaid: true, paidAt: new Date() } });
      return true;
    });
    if (changed) this.gateway.emitOrderPaymentUpdated(payment.orderId, payment.id, 'COMPLETED');
  }
}
