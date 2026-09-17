import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { DailySummaryDto } from './dto/daily-summary.dto';
import { PaymentMethodStatsDto } from './dto/payments-split.dto';
import { RevenueGranularity, RevenueBucketDto } from './dto/revenue.dto';
import { WaiterTipsDto } from './dto/tips.dto';

@Controller('api/v1/admin/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('daily-summary')
  getDailySummary(@Query('tenantId') tenantId: string): Promise<DailySummaryDto> {
    return this.analyticsService.getDailySummary(tenantId);
  }

  @Get('revenue')
  getRevenue(
    @Query('tenantId') tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('granularity') granularity: RevenueGranularity | undefined,
  ): Promise<RevenueBucketDto[]> {
    return this.analyticsService.getRevenue(
      tenantId,
      from,
      to,
      granularity ?? 'day',
    );
  }

  @Get('payments-split')
  getPaymentsSplit(
    @Query('tenantId') tenantId: string,
  ): Promise<PaymentMethodStatsDto[]> {
    return this.analyticsService.getPaymentsSplit(tenantId);
  }

  @Get('tips')
  getTips(@Query('tenantId') tenantId: string): Promise<WaiterTipsDto[]> {
    return this.analyticsService.getTips(tenantId);
  }
}
