import { Controller, Get, Headers, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { Granularity } from '@bonapp/shared-types';
import { GRANULARITY } from '@bonapp/shared-types';
import { AnalyticsService } from './analytics.service';

const VALID_GRANULARITIES = new Set<string>(Object.values(GRANULARITY));

function parseGranularity(value: string | undefined): Granularity {
  if (value && VALID_GRANULARITIES.has(value)) return value as Granularity;
  return GRANULARITY.HOUR;
}

@Controller('api/v1/admin/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('revenue')
  getRevenue(
    @Headers('x-tenant-id') tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('granularity') granularity: string,
  ) {
    return this.analyticsService.getRevenue(
      tenantId,
      new Date(from),
      new Date(to),
      parseGranularity(granularity),
    );
  }

  @Get('payment-split')
  getPaymentSplit(
    @Headers('x-tenant-id') tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.analyticsService.getPaymentSplit(
      tenantId,
      new Date(from),
      new Date(to),
    );
  }

  @Get('tips')
  getTips(
    @Headers('x-tenant-id') tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.analyticsService.getTips(tenantId, new Date(from), new Date(to));
  }

  @Get('z-report')
  getZReport(@Headers('x-tenant-id') tenantId: string) {
    return this.analyticsService.getZReport(tenantId);
  }

  @Get('transactions/export')
  async exportTransactions(
    @Headers('x-tenant-id') tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    const csv = await this.analyticsService.exportTransactionsCsv(
      tenantId,
      new Date(from),
      new Date(to),
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    res.send(csv);
  }
}
