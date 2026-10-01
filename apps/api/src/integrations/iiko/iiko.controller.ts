import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminRoleGuard } from '../../auth/admin-role.guard';
import { IikoService } from './iiko.service';

@Controller('admin/pos')
@UseGuards(AuthGuard, AdminRoleGuard)
export class IikoController {
  constructor(private readonly iiko: IikoService) {}

  @Get('sync-status')
  syncStatus() { return this.iiko.getSyncStatus(); }
}
