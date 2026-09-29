import { Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { IikoService } from '../integrations/iiko/iiko.service';

@Controller('admin/pos')
@UseGuards(AuthGuard)
export class PosSyncController {
  constructor(private readonly iiko: IikoService) {}

  @Post('sync-menu')
  @UseGuards(TenantContextGuard, AdminRoleGuard)
  syncMenu() {
    return this.iiko.enqueueSync();
  }
}
