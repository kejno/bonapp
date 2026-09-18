import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { OplatiService } from './oplati/oplati.service';

export interface CreateOplatiPaymentResult {
  paymentId: string;
  qrCodeData: string;
  deepLink: string;
  eripCode: string | null;
  totalWithTipsByn: number;
}

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oplati: OplatiService,
    private readonly events: EventsGateway,
  ) {}

  async createOplatiPayment(orderId: string): Promise<CreateOplatiPaymentResult> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (order.isPaid) {
      throw new ConflictException(`Order ${orderId} is already paid`);
    }

    const totalWithTipsByn = order.total + order.tipAmount;

    const oplatiResult = await this.oplati.createPayment(orderId, totalWithTipsByn);

    const payment = await this.prisma.payment.create({
      data: {
        orderId,
        externalId: oplatiResult.externalId,
        provider: 'oplati',
        status: PaymentStatus.PENDING,
        qrCodeData: oplatiResult.qrCodeData,
        deepLink: oplatiResult.deepLink,
        eripCode: oplatiResult.eripCode,
        totalWithTipsByn,
      },
    });

    return {
      paymentId: payment.id,
      qrCodeData: payment.qrCodeData,
      deepLink: payment.deepLink,
      eripCode: payment.eripCode ?? null,
      totalWithTipsByn: payment.totalWithTipsByn,
    };
  }

  async processWebhookConfirmation(externalId: string): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { externalId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment with externalId ${externalId} not found`);
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.COMPLETED },
      });

      await tx.order.update({
        where: { id: payment.orderId },
        data: { isPaid: true },
      });
    });

    this.events.emitPaymentUpdate(payment.orderId, payment.id);
  }
}
