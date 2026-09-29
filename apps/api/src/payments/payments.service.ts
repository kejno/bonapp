import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentGateway, PaymentMethodName } from './payment-gateway';
import { PaymentQueue } from './payment-queue';
import { MenuGateway } from '../menu/menu.gateway';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService, private readonly gateway: PaymentGateway, private readonly queue: PaymentQueue, private readonly socket: MenuGateway) {
    this.queue.registerHandler((method, event) => this.process(method, event));
  }

  async initiate(orderId: string, tenantId: string, tableId: string, method: PaymentMethodName) {
    const db = this.prisma.forTenant(tenantId);
    const order = await db.order.findFirst({ where: { id: orderId, tableId }, select: { id: true, isPaid: true, totalAmountByn: true, guestSessionId: true } });
    if (!order) throw new NotFoundException('Order not found for this table');
    if (order.isPaid) throw new ConflictException('Order is already paid');
    const current = await db.payment.findFirst({ where: { orderId, status: PaymentStatus.PENDING }, orderBy: { createdAt: 'desc' } });
    const provider = method === 'ERIP' ? 'ERIP_EPOS' : 'BEPAID';
    if (current?.provider === provider) {
      const stored = current.payload as Record<string, unknown> | null;
      return this.paymentResponse(current, method, typeof stored?.['checkoutUrl'] === 'string' ? stored['checkoutUrl'] : undefined);
    }
    if (current) {
      const previousMethod: PaymentMethodName = current.provider === 'BEPAID' ? 'BEPAID' : 'ERIP';
      const transactionId = current.providerTransactionId;
      if (!transactionId || !(await this.gateway.cancel(previousMethod, transactionId))) throw new ConflictException('Current payment cannot be cancelled');
      await db.payment.update({ where: { id: current.id }, data: { status: PaymentStatus.FAILED } });
    }
    let payment;
    try {
      payment = await db.payment.create({ data: { orderId, tenantId, amountByn: order.totalAmountByn, provider, status: PaymentStatus.PENDING } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Another payment is being initiated');
      throw error;
    }
    let external;
    try {
      external = await this.gateway.create(method, { paymentId: payment.id, tenantId, orderId, amount: Number(order.totalAmountByn) });
    } catch (error) {
      await db.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED } });
      throw error;
    }
    const updated = await db.payment.update({ where: { id: payment.id }, data: { providerTransactionId: external.id, eripOrderNumber: external.eripOrderNumber, payload: external.checkoutUrl ? { checkoutUrl: external.checkoutUrl } : undefined } });
    return this.paymentResponse(updated, method, external.checkoutUrl);
  }

  async enqueue(method: PaymentMethodName, event: Record<string, unknown>) { await this.queue.add(method, event); }

  async process(method: PaymentMethodName, event: Record<string, unknown>) {
    const paymentId = event['paymentId'];
    const tenantId = event['tenantId'];
    const outcome = typeof event['status'] === 'string' ? event['status'].toLowerCase() : '';
    if (typeof paymentId !== 'string' || typeof tenantId !== 'string' || !['confirmed', 'success', 'completed', 'failed', 'declined', 'error'].includes(outcome)) return;
    const payment = await this.prisma.forTenant(tenantId).payment.findUnique({ where: { id: paymentId }, include: { order: { select: { tableId: true, guestSessionId: true } } } });
    if (!payment || payment.status !== PaymentStatus.PENDING || payment.provider !== (method === 'ERIP' ? 'ERIP_EPOS' : 'BEPAID')) return;
    const completed = ['confirmed', 'success', 'completed'].includes(outcome);
    const result = await this.prisma.transactionForTenant(payment.tenantId, async (tx) => {
      const changed = await tx.payment.updateMany({ where: { id: payment.id, status: PaymentStatus.PENDING }, data: { status: completed ? PaymentStatus.COMPLETED : PaymentStatus.FAILED, payload: event as Prisma.InputJsonValue } });
      if (!changed.count) return false;
      if (completed) await tx.order.update({ where: { id_tenantId: { id: payment.orderId, tenantId: payment.tenantId } }, data: { isPaid: true, paidAt: new Date() } });
      return true;
    });
    if (!result) return;
    const payload = { orderId: payment.orderId, paymentId: payment.id, status: completed ? 'COMPLETED' : 'FAILED', method };
    this.socket.emitPaymentStatusChanged(payment.tenantId, payment.order.tableId, payment.order.guestSessionId, payload);
  }

  private paymentResponse(payment: { id: string; eripOrderNumber: string | null }, method: PaymentMethodName, checkoutUrl?: string) {
    return method === 'ERIP' ? { paymentId: payment.id, erip_order_number: payment.eripOrderNumber } : { paymentId: payment.id, checkoutUrl };
  }
}
