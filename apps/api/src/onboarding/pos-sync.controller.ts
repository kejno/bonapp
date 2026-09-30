import { BadRequestException, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { OnboardingService } from './onboarding.service';
import { IikoService } from '../integrations/iiko/iiko.service';

@Controller('admin/pos')
@UseGuards(AuthGuard)
export class PosSyncController {
  constructor(private readonly onboarding: OnboardingService, private readonly iiko: IikoService) {}

  @Post('sync-menu')
  @UseGuards(TenantContextGuard, AdminRoleGuard)
  async syncMenu() {
    try {
      return await this.iiko.enqueueSync();
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      return this.onboarding.startImport();
    }
  }
}
