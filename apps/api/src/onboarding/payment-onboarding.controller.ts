import { Body, Controller, Get, Headers, Put } from '@nestjs/common';
import type {
  PaymentOnboardingStatusResponse,
  SavePaymentOnboardingRequest,
} from '@bonapp/shared-types';
import { PaymentOnboardingService } from './payment-onboarding.service';

@Controller('api/v1/admin/tenant/onboarding/step3/payments')
export class PaymentOnboardingController {
  constructor(
    private readonly paymentOnboardingService: PaymentOnboardingService,
  ) {}

  @Get()
  getStatuses(
    @Headers('x-tenant-id') tenantId: string,
  ): Promise<PaymentOnboardingStatusResponse> {
    return this.paymentOnboardingService.getStatuses(tenantId);
  }

  @Put()
  async save(
    @Headers('x-tenant-id') tenantId: string,
    @Body() request: SavePaymentOnboardingRequest,
  ): Promise<void> {
    await this.paymentOnboardingService.save(tenantId, request);
  }
}
