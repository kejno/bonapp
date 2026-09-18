import { Module } from '@nestjs/common';
import { GuestPaymentController } from './guest-payment.controller';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [PaymentModule],
  controllers: [GuestPaymentController],
})
export class GuestModule {}
