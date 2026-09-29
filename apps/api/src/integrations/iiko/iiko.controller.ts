import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminRoleGuard } from '../../auth/admin-role.guard';
import { IikoService } from './iiko.service';

@Controller('admin/pos')
@UseGuards(AuthGuard, AdminRoleGuard)
export class IikoController {
  constructor(private readonly iiko: IikoService) {}

  @Post('sync-menu')
  syncMenu() { return this.iiko.enqueueSync(); }

  @Get('sync-status')
  syncStatus() { return this.iiko.getSyncStatus(); }
}
