import { Module } from '@nestjs/common';
import { PaymentOnboardingController } from './payment-onboarding.controller';
import {
  PAYMENT_CREDENTIALS_ENCRYPTION_KEY,
  PaymentOnboardingService,
} from './payment-onboarding.service';

@Module({
  controllers: [PaymentOnboardingController],
  providers: [
    PaymentOnboardingService,
    {
      provide: PAYMENT_CREDENTIALS_ENCRYPTION_KEY,
      useFactory: () => process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY ?? '',
    },
  ],
})
export class PaymentOnboardingModule {}
