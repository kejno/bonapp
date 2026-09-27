import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { OnboardingService } from './onboarding.service';

@Controller('admin/tenant/onboarding/step2')
@UseGuards(AuthGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('pos-check')
  check(@Body() body: { posType: string; apiKey: string; url: string }) {
    return this.onboarding.checkPos(body);
  }

  @Post('pos')
  save(@Body() body: { posType: string; apiKey?: string; url?: string }) {
    return this.onboarding.savePos(body);
  }

  @Post('import')
  importMenu() {
    return this.onboarding.startImport();
  }

  @Post('import/retry')
  retryImport() {
    return this.onboarding.retryImport();
  }

  @Get('import')
  importStatus() {
    return this.onboarding.getImportStatus();
  }
}
