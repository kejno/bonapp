import { Body, Controller, Headers, Put } from '@nestjs/common';
import { OnboardingService, Step1Input } from './onboarding.service';

type Step1Body = Omit<Step1Input, 'tenantId'>;

@Controller('api/v1/admin/tenant/onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Put('step1')
  saveStep1(@Headers('x-tenant-id') tenantId: string, @Body() body: Step1Body) {
    return this.onboardingService.saveStep1({ ...body, tenantId });
  }
}
