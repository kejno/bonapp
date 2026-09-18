import { Controller, Param, Post } from '@nestjs/common';
import { GuestPaymentsService } from './guest-payments.service';
import type { OplatiPaymentSession } from './guest-payments.service';

@Controller('guest/orders')
export class GuestPaymentsController {
  constructor(private readonly guestPaymentsService: GuestPaymentsService) {}

  @Post(':orderId/pay/oplati')
  createOplatiPayment(@Param('orderId') orderId: string): OplatiPaymentSession {
    return this.guestPaymentsService.createOplatiPayment(orderId);
  }
}
