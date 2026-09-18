import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { PaymentService, CreateOplatiPaymentResult } from '../payment/payment.service';

@Controller('api/v1/guest/orders')
export class GuestPaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post(':orderId/pay/oplati')
  @HttpCode(201)
  initiateOplatiPayment(
    @Param('orderId') orderId: string,
  ): Promise<CreateOplatiPaymentResult> {
    return this.paymentService.createOplatiPayment(orderId);
  }
}
