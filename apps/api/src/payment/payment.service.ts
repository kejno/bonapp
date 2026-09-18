import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BepaidClient } from './bepaid.client';
import { EripClient } from './erip.client';

export interface EripPaymentResult {
  eripOrderNumber: string;
}

export interface BepaidPaymentResult {
  checkoutUrl: string;
}

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eripClient: EripClient,
    private readonly bepaidClient: BepaidClient,
  ) {}

  async initiateErip(orderId: string): Promise<EripPaymentResult> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    const pending = await this.prisma.payment.findFirst({
      where: { orderId, status: PaymentStatus.PENDING },
    });

    if (pending) {
      if (pending.method === PaymentMethod.ERIP) {
        return { eripOrderNumber: pending.gatewayRef! };
      }
      const cancelled = await this.bepaidClient.voidCheckout(pending.gatewayRef!);
      if (!cancelled) {
        throw new ConflictException(
          'An active bePaid payment exists and could not be cancelled',
        );
      }
      await this.prisma.payment.update({
        where: { id: pending.id },
        data: { status: PaymentStatus.FAILED },
      });
    }

    const { eripOrderNumber } = await this.eripClient.createOrder(
      orderId,
      order.amount,
      order.currency,
    );

    await this.prisma.payment.create({
      data: {
        tenantId: order.tenantId,
        orderId,
        method: PaymentMethod.ERIP,
        status: PaymentStatus.PENDING,
        amount: order.amount,
        currency: order.currency,
        gatewayRef: eripOrderNumber,
      },
    });

    return { eripOrderNumber };
  }

  async initiateBepaid(orderId: string): Promise<BepaidPaymentResult> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    const pending = await this.prisma.payment.findFirst({
      where: { orderId, status: PaymentStatus.PENDING },
    });

    if (pending) {
      if (pending.method === PaymentMethod.BEPAID) {
        return { checkoutUrl: pending.checkoutUrl! };
      }
      const cancelled = await this.eripClient.cancelOrder(pending.gatewayRef!);
      if (!cancelled) {
        throw new ConflictException(
          'An active ERIP payment exists and could not be cancelled',
        );
      }
      await this.prisma.payment.update({
        where: { id: pending.id },
        data: { status: PaymentStatus.FAILED },
      });
    }

    const { token, checkoutUrl } = await this.bepaidClient.createCheckout(
      orderId,
      order.amount,
      order.currency,
    );

    await this.prisma.payment.create({
      data: {
        tenantId: order.tenantId,
        orderId,
        method: PaymentMethod.BEPAID,
        status: PaymentStatus.PENDING,
        amount: order.amount,
        currency: order.currency,
        gatewayRef: token,
        checkoutUrl,
      },
    });

    return { checkoutUrl };
  }
}
