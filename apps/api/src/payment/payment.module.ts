import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { OplatiService } from './oplati/oplati.service';

@Module({
  providers: [PaymentService, OplatiService],
  exports: [PaymentService],
})
export class PaymentModule {}
