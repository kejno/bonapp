import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { TenantContextService } from '../tenant/tenant-context.service';
import { AnalyticsService } from './analytics.service';

@Controller('admin/analytics')
@ApiTags('Администрирование')
@ApiBearerAuth()
@UseGuards(AuthGuard, TenantContextGuard, AdminRoleGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService, private readonly tenantContext: TenantContextService) {}

  @ApiOperation({ summary: 'Получить current-date' })
  @Get('current-date')
  currentDate() { return this.analytics.currentTenantDate(this.tenantId()); }
  @ApiOperation({ summary: 'Получить daily-summary' })
  @Get('daily-summary')
  dailySummary() { return this.analytics.dailySummary(this.tenantId()); }
  @ApiOperation({ summary: 'Получить revenue' })
  @Get('revenue')
  revenue(@Query('from') from?: string, @Query('to') to?: string, @Query('granularity') granularity?: string) { return this.analytics.revenue(this.tenantId(), from, to, granularity); }
  @ApiOperation({ summary: 'Получить payments-split' })
  @Get('payments-split')
  paymentsSplit(@Query('from') from?: string, @Query('to') to?: string) { return this.analytics.paymentsSplit(this.tenantId(), from, to); }
  @ApiOperation({ summary: 'Получить tips' })
  @Get('tips')
  tips(@Query('from') from?: string, @Query('to') to?: string) { return this.analytics.tips(this.tenantId(), from, to); }
  @ApiOperation({ summary: 'Получить shift-report' })
  @Get('shift-report')
  shiftReport() { return this.analytics.shiftReport(this.tenantId()); }
  @ApiOperation({ summary: 'Получить transactions/export' })
  @Get('transactions/export')
  async exportTransactions(@Query('from') from: string, @Query('to') to: string, @Res() response: Response) {
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    response.send(await this.analytics.exportTransactions(this.tenantId(), from, to));
  }

  private tenantId() { return this.tenantContext.getTenantId()!; }
}
