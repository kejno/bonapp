import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import type { SavePosSettingsInput } from './onboarding.service';

@Controller('api/v1/admin/tenant/onboarding/step2')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('pos-check')
  checkPos(@Headers('x-tenant-id') tenantId: string, @Body() input: SavePosSettingsInput) {
    return this.onboardingService.checkPos(tenantId, input);
  }

  @Post('pos-settings')
  savePosSettings(@Headers('x-tenant-id') tenantId: string, @Body() input: SavePosSettingsInput) {
    return this.onboardingService.savePosSettings(tenantId, input);
  }

  @Post('menu-import')
  startImport(@Headers('x-tenant-id') tenantId: string) {
    return this.onboardingService.startImport(tenantId);
  }

  @Get('menu-import')
  getImportProgress(@Headers('x-tenant-id') tenantId: string) {
    return this.onboardingService.getImportProgress(tenantId);
  }
}
