import { ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import { BadRequestException, Controller, Headers, HttpCode, Injectable, OnModuleDestroy, OnModuleInit, Optional, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { FiscalizationStatus, OrderStatus, PaymentStatus, Prisma, TableStatus } from '@prisma/client';
import { Job, JobsOptions, Queue, Worker } from 'bullmq';
import type { Request } from 'express';
import { createVerify, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { decryptCredentials, isEncryptedCredentials } from '../tenant/payment-credentials';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { MenuGateway } from '../menu/menu.gateway';
import { FiscalizationService } from '../staff/fiscalization.service';

interface WebhookJob { tenantId: string; body: Record<string, unknown> }

export const bepaidWebhookJobOptions: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: true,
  // Let a repeated provider delivery enqueue a fresh job after retries are exhausted.
  removeOnFail: true,
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

@Injectable()
export class BepaidWebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly queue: Queue<WebhookJob>;
  private readonly worker: Worker<WebhookJob>;
  constructor(private readonly prisma: PrismaService, private readonly menuGateway: MenuGateway, @Optional() private readonly fiscalization?: FiscalizationService) {
    const connection = { host: process.env.REDIS_HOST ?? 'localhost', port: Number(process.env.REDIS_PORT ?? 6379) };
    this.queue = new Queue('bepaid-webhooks', { connection });
    this.worker = new Worker('bepaid-webhooks', (job) => this.process(job), { connection });
  }
  async onModuleInit() { await this.worker.waitUntilReady(); }
  async onModuleDestroy() { await this.worker.close(); await this.queue.close(); }

  async accept(tenantId: string, raw: Buffer | undefined, signature: string | undefined, authorization: string | undefined) {
    if (!raw || !signature) throw new UnauthorizedException('Invalid bePaid signature');
    const tenant = await this.prisma.db.tenant.findUnique({ where: { id: tenantId }, select: { paymentCredentials: true } });
    const encrypted = (tenant?.paymentCredentials as Record<string, unknown> | null)?.bepaid;
    if (!isEncryptedCredentials(encrypted) || !process.env.PAYMENT_CREDENTIALS_SECRET) throw new UnauthorizedException();
    const credentials = decryptCredentials<{ provider: string; shopId: string; secret: string; publicKey?: string }>(encrypted, process.env.PAYMENT_CREDENTIALS_SECRET);
    if (credentials.provider !== 'bepaid' || !credentials.publicKey) throw new UnauthorizedException();
    const verifier = createVerify('RSA-SHA256'); verifier.update(raw); verifier.end();
    if (!verifier.verify(credentials.publicKey, signature, 'base64')) throw new UnauthorizedException('Invalid bePaid signature');
    const expected = `Basic ${Buffer.from(`${credentials.shopId}:${credentials.secret}`).toString('base64')}`;
    const received = Buffer.from(authorization ?? ''); const wanted = Buffer.from(expected);
    if (received.length !== wanted.length || !timingSafeEqual(received, wanted)) throw new UnauthorizedException();
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw.toString('utf8')) as Record<string, unknown>; } catch { throw new BadRequestException(); }
    const transaction = objectValue(body.transaction ?? body);
    const trackingId = stringValue(transaction.tracking_id) ?? 'unknown';
    const uid = stringValue(transaction.uid) ?? 'unknown';
    await this.queue.add('process', { tenantId, body }, { ...bepaidWebhookJobOptions, jobId: `bepaid-${tenantId}-${trackingId}-${uid}` });
  }

  private async process(job: Job<WebhookJob>) {
    const { tenantId, body } = job.data;
    const transaction = objectValue(body.transaction ?? body);
    const trackingId = stringValue(transaction.tracking_id);
    const status = stringValue(transaction.status);
    const mapped = status === 'successful' ? PaymentStatus.SUCCEEDED : status === 'failed' ? PaymentStatus.FAILED : status === 'expired' ? PaymentStatus.CANCELLED : status === 'incomplete' ? PaymentStatus.PENDING : null;
    if (!trackingId || !mapped) return;
    const completed = await this.prisma.transactionForTenant(tenantId, async (tx) => {
      const payment = await tx.payment.findFirst({ where: { id: trackingId, tenantId, provider: 'bepaid' } });
      if (!payment) return null;
      if (payment.status === PaymentStatus.SUCCEEDED) {
        return payment.fiscalizationStatus === FiscalizationStatus.PENDING
          ? { paymentId: payment.id, orderId: '', tableId: '', notify: false }
          : null;
      }
      const updated = await tx.payment.update({ where: { id: payment.id }, data: {
        status: mapped,
        ...(mapped === PaymentStatus.SUCCEEDED ? { fiscalizationStatus: FiscalizationStatus.PENDING } : {}),
        providerTransactionId: stringValue(transaction.uid) ?? payment.providerTransactionId,
        payload: body as Prisma.InputJsonValue,
      } });
      if (updated.status !== PaymentStatus.SUCCEEDED) return null;
      const order = await tx.order.findFirst({ where: { id: payment.orderId, tenantId } });
      if (!order || order.isPaid || order.status !== OrderStatus.SERVED) return null;
      await tx.order.update({ where: { id_tenantId: { id: order.id, tenantId } }, data: { isPaid: true, status: OrderStatus.PAID, paidAt: new Date() } });
      await tx.table.update({ where: { id_tenantId: { id: order.tableId, tenantId } }, data: { status: TableStatus.AVAILABLE } });
      return { orderId: order.id, tableId: order.tableId, paymentId: payment.id, notify: true };
    });
    if (completed) {
      await this.fiscalization?.enqueue(tenantId, completed.paymentId);
      if (completed.notify) {
        this.menuGateway.emitOrderStatusChanged(tenantId, completed.orderId, OrderStatus.PAID);
        await this.menuGateway.closeOrderSession(tenantId, completed.tableId, completed.orderId);
      }
    }
  }
}

@Controller('webhooks/bepaid')
@ApiTags('Вебхуки bePaid')
@SkipTenantGuard()
export class BepaidWebhookController {
  constructor(private readonly service: BepaidWebhookService) {}
  @ApiOperation({ summary: 'Принять уведомление bePaid', description: 'Вызов из Swagger UI без корректной подписи провайдера завершится ошибкой авторизации.' })
  @ApiParam({ name: 'tenantId', description: 'Идентификатор ресторана', example: 'tenant-uuid' })
  @ApiResponse({ status: 200, description: 'Уведомление принято' })
  @ApiResponse({ status: 401, description: 'Подпись или авторизация провайдера неверна' })
  @Post(':tenantId')
  @HttpCode(200)
  async receive(@Param('tenantId') tenantId: string, @Req() req: Request & { rawBody?: Buffer }, @Headers('content-signature') signature?: string, @Headers('authorization') authorization?: string) {
    await this.service.accept(tenantId, req.rawBody, signature, authorization);
    return { received: true };
  }
}
