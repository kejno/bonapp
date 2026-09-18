import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import {
  BepaidPaymentResult,
  EripPaymentResult,
  PaymentService,
} from './payment.service';

@Controller('api/v1/guest/orders')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post(':orderId/pay/erip')
  @HttpCode(200)
  payErip(@Param('orderId') orderId: string): Promise<EripPaymentResult> {
    return this.paymentService.initiateErip(orderId);
  }

  @Post(':orderId/pay/bepaid')
  @HttpCode(200)
  payBepaid(@Param('orderId') orderId: string): Promise<BepaidPaymentResult> {
    return this.paymentService.initiateBepaid(orderId);
  }
}
