import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
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
  @Get('payments-split') paymentsSplit(@Query('from') from?: string, @Query('to') to?: string) { return this.analytics.paymentsSplit(this.tenantId(), from, to); }
  @Get('tips') tips(@Query('from') from?: string, @Query('to') to?: string) { return this.analytics.tips(this.tenantId(), from, to); }
  @Get('shift-report') shiftReport() { return this.analytics.shiftReport(this.tenantId()); }
  @Get('transactions/export') async exportTransactions(@Query('from') from: string, @Query('to') to: string, @Res() response: Response) {
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    response.send(await this.analytics.exportTransactions(this.tenantId(), from, to));
  }

  private tenantId() { return this.tenantContext.getTenantId()!; }
}
