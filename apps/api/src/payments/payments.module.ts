import { Module } from '@nestjs/common';
import { GuestPaymentsController } from './guest-payments.controller';
import { GuestPaymentsService } from './guest-payments.service';

@Module({
  controllers: [GuestPaymentsController],
  providers: [GuestPaymentsService],
})
export class PaymentsModule {}
