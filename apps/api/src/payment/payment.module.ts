import { Module } from '@nestjs/common';
import { PaymentConfigService } from '../config/payment-config.service';
import { BepaidClient } from './bepaid.client';
import { EripClient } from './erip.client';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, EripClient, BepaidClient, PaymentConfigService],
  exports: [PaymentService],
})
export class PaymentModule {}
