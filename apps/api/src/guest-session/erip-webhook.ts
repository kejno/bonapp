import { BadRequestException, Controller, Headers, HttpCode, Injectable, OnModuleDestroy, OnModuleInit, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma, TableStatus } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import type { Request } from 'express';
import { createVerify, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { decryptCredentials, isEncryptedCredentials } from '../tenant/payment-credentials';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { MenuGateway } from '../menu/menu.gateway';
import { EripClient } from './erip.client';

interface EripJob { tenantId: string; body: Record<string, unknown> }
const objectValue = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

@Injectable()
export class EripWebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly queue: Queue<EripJob>;
  private readonly worker: Worker<EripJob>;
  constructor(private readonly prisma: PrismaService, private readonly erip: EripClient, private readonly gateway: MenuGateway) {
    const connection = { host: process.env.REDIS_HOST ?? 'localhost', port: Number(process.env.REDIS_PORT ?? 6379) };
    this.queue = new Queue('erip-webhooks', { connection });
    this.worker = new Worker('erip-webhooks', (job) => this.process(job), { connection });
  }
  async onModuleInit() { await this.worker.waitUntilReady(); }
  async onModuleDestroy() { await this.worker.close(); await this.queue.close(); }

  async accept(tenantId: string, raw: Buffer | undefined, signature?: string, authorization?: string) {
    if (!raw) throw new BadRequestException();
    const tenant = await this.prisma.db.tenant.findUnique({ where: { id: tenantId }, select: { paymentCredentials: true } });
    const encrypted = (tenant?.paymentCredentials as Record<string, unknown> | null)?.erip;
    if (!isEncryptedCredentials(encrypted) || !process.env.PAYMENT_CREDENTIALS_SECRET) throw new UnauthorizedException();
    const credentials = decryptCredentials<{ shopId: string; secret: string; publicKey?: string }>(encrypted, process.env.PAYMENT_CREDENTIALS_SECRET);
    const expectedAuth = `Basic ${Buffer.from(`${credentials.shopId}:${credentials.secret}`).toString('base64')}`;
    const receivedAuth = Buffer.from(authorization ?? ''), wantedAuth = Buffer.from(expectedAuth);
    if (receivedAuth.length !== wantedAuth.length || !timingSafeEqual(receivedAuth, wantedAuth)) throw new UnauthorizedException();
    if (signature) {
      if (!credentials.publicKey) throw new UnauthorizedException();
      const verifier = createVerify('RSA-SHA256'); verifier.update(raw); verifier.end();
      if (!verifier.verify(credentials.publicKey, signature, 'base64')) throw new UnauthorizedException('Invalid bePaid signature');
    }
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw.toString('utf8')) as Record<string, unknown>; } catch { throw new BadRequestException(); }
    const transaction = objectValue(body.transaction);
    if (typeof transaction.tracking_id !== 'string' || typeof transaction.uid !== 'string') throw new BadRequestException();
    await this.queue.add('process', { tenantId, body }, { jobId: `erip-${tenantId}-${transaction.tracking_id}-${transaction.uid}`, attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: true, removeOnFail: true });
    return { received: true };
  }

  private async process(job: Job<EripJob>) {
    const { tenantId, body } = job.data;
    const transaction = objectValue(body.transaction);
    const trackingId = transaction.tracking_id, uid = transaction.uid, status = transaction.status;
    if (typeof trackingId !== 'string' || typeof uid !== 'string' || typeof status !== 'string') return;
    const tenant = await this.prisma.db.tenant.findUnique({ where: { id: tenantId }, select: { paymentCredentials: true } });
    const encoded = (tenant?.paymentCredentials as Record<string, unknown> | null)?.erip;
    if (!isEncryptedCredentials(encoded) || !process.env.PAYMENT_CREDENTIALS_SECRET) return;
    const credentials = decryptCredentials<{ shopId: string; secret: string }>(encoded, process.env.PAYMENT_CREDENTIALS_SECRET);
    const verified = await this.erip.get(uid, credentials.shopId, credentials.secret);
    if (verified.status !== status || verified.uid !== uid) return;
    const mapped = status === 'successful' ? PaymentStatus.SUCCEEDED : status === 'failed' ? PaymentStatus.PENDING : status === 'expired' || status === 'deleted' ? PaymentStatus.CANCELLED : null;
    if (!mapped) return;
    const completed = await this.prisma.transactionForTenant(tenantId, async (tx) => {
      const payment = await tx.payment.findFirst({ where: { id: trackingId, tenantId, provider: 'erip' } });
      if (!payment || payment.providerTransactionId !== uid || payment.status === PaymentStatus.SUCCEEDED) return null;
      const order = mapped === PaymentStatus.SUCCEEDED
        ? await tx.order.findFirst({ where: { id: payment.orderId, tenantId } })
        : null;
      if (mapped === PaymentStatus.SUCCEEDED && (!order || order.isPaid || order.status !== OrderStatus.SERVED)) return null;
      const updated = await tx.payment.updateMany({ where: { id: payment.id, status: PaymentStatus.PENDING }, data: { status: mapped, payload: body as Prisma.InputJsonValue } });
      if (!updated.count || mapped !== PaymentStatus.SUCCEEDED) return null;
      if (!order) return null;
      await tx.order.update({ where: { id_tenantId: { id: order.id, tenantId } }, data: { isPaid: true, status: OrderStatus.PAID, paidAt: new Date() } });
      await tx.table.update({ where: { id_tenantId: { id: order.tableId, tenantId } }, data: { status: TableStatus.AVAILABLE } });
      return { orderId: order.id, tableId: order.tableId, paymentId: payment.id, guestSessionId: order.guestSessionId };
    });
    if (completed) {
      this.gateway.emitPaymentStatusChanged(tenantId, completed.tableId, completed.guestSessionId, { orderId: completed.orderId, paymentId: completed.paymentId, status: 'SUCCEEDED', method: 'ERIP' });
      this.gateway.emitOrderStatusChanged(tenantId, completed.orderId, OrderStatus.PAID);
      await this.gateway.closeOrderSession(tenantId, completed.tableId, completed.orderId);
    }
  }
}

@Controller('webhooks/erip')
@SkipTenantGuard()
export class EripWebhookController {
  constructor(private readonly service: EripWebhookService) {}
  @Post(':tenantId')
  @HttpCode(200)
  async receive(@Param('tenantId') tenantId: string, @Req() request: Request & { rawBody?: Buffer }, @Headers('content-signature') signature?: string, @Headers('authorization') authorization?: string) {
    return this.service.accept(tenantId, request.rawBody, signature, authorization);
  }
}
