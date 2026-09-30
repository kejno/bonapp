import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { TenantContextService } from '../tenant/tenant-context.service';
import { AnalyticsService } from './analytics.service';

@Controller('admin/analytics')
@UseGuards(AuthGuard, TenantContextGuard, AdminRoleGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService, private readonly tenantContext: TenantContextService) {}

  @Get('daily-summary') dailySummary() { return this.analytics.dailySummary(this.tenantId()); }
  @Get('revenue') revenue(@Query('from') from?: string, @Query('to') to?: string, @Query('granularity') granularity?: string) { return this.analytics.revenue(this.tenantId(), from, to, granularity); }
  @Get('payments-split') paymentsSplit() { return this.analytics.paymentsSplit(this.tenantId()); }
  @Get('tips') tips(@Query('from') from?: string, @Query('to') to?: string) { return this.analytics.tips(this.tenantId(), from, to); }

  private tenantId() { return this.tenantContext.getTenantId()!; }
}
