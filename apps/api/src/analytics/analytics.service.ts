import { Injectable } from '@nestjs/common';
import { OrderStatus, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DailySummaryDto } from './dto/daily-summary.dto';
import { PaymentMethodKey, PaymentMethodStatsDto } from './dto/payments-split.dto';
import { RevenueGranularity, RevenueBucketDto } from './dto/revenue.dto';
import { WaiterTipsDto } from './dto/tips.dto';
import { getDateBoundsUtc, getDayBoundsUtc } from './utils/day-bounds';

interface TopDishRow {
  menuItemId: string;
  name: string;
  quantitySold: number;
  totalRevenue: number;
}

interface RevenueBucketRow {
  bucket: string;
  revenue: number;
  orderCount: number;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDailySummary(tenantId: string): Promise<DailySummaryDto> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { timezone: true },
    });

    const { start, end } = getDayBoundsUtc(tenant.timezone);

    const [revenueAgg, orderCount, openOrderCount, totalTables, topDishRows] =
      await Promise.all([
        this.prisma.order.aggregate({
          where: {
            tenantId,
            status: OrderStatus.CLOSED,
            createdAt: { gte: start, lte: end },
          },
          _sum: { total: true },
          _count: { id: true },
        }),
        this.prisma.order.count({
          where: {
            tenantId,
            status: { not: OrderStatus.CANCELLED },
            createdAt: { gte: start, lte: end },
          },
        }),
        this.prisma.order.count({
          where: { tenantId, status: OrderStatus.OPEN },
        }),
        this.prisma.table.count({
          where: { tenantId, isActive: true },
        }),
        this.prisma.$queryRaw<TopDishRow[]>`
          SELECT
            oi."menuItemId",
            oi.name,
            SUM(oi.quantity)::float       AS "quantitySold",
            SUM(oi.quantity * oi."unitPrice")::float AS "totalRevenue"
          FROM "OrderItem" oi
          JOIN "Order" o ON oi."orderId" = o.id
          WHERE o."tenantId"  = ${tenantId}
            AND o.status::text != 'CANCELLED'
            AND o."createdAt" >= ${start}
            AND o."createdAt" <= ${end}
          GROUP BY oi."menuItemId", oi.name
          ORDER BY SUM(oi.quantity) DESC,
                   SUM(oi.quantity * oi."unitPrice") DESC,
                   oi.name ASC
          LIMIT 5
        `,
      ]);

    const revenueTotal = Number(revenueAgg._sum.total ?? 0);
    const closedCount = revenueAgg._count.id;

    const dateStr = start
      .toLocaleDateString('sv-SE', { timeZone: tenant.timezone });

    return {
      date: dateStr,
      revenueTotal,
      avgCheck: closedCount > 0 ? revenueTotal / closedCount : 0,
      orderCount,
      tableOccupancyPercent:
        totalTables > 0 ? Math.round((openOrderCount / totalTables) * 100) : 0,
      posPingMs: null,
      topDishes: topDishRows.map((r) => ({
        menuItemId: r.menuItemId,
        name: r.name,
        quantitySold: Number(r.quantitySold),
        totalRevenue: Number(r.totalRevenue),
      })),
    };
  }

  async getRevenue(
    tenantId: string,
    from: string,
    to: string,
    granularity: RevenueGranularity,
  ): Promise<RevenueBucketDto[]> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { timezone: true },
    });

    const { start } = getDateBoundsUtc(tenant.timezone, from);
    const { end } = getDateBoundsUtc(tenant.timezone, to);

    const rows = await this.prisma.$queryRaw<RevenueBucketRow[]>`
      SELECT
        date_trunc(${granularity}, "createdAt" AT TIME ZONE ${tenant.timezone})::text AS bucket,
        COALESCE(SUM(total), 0)::float AS revenue,
        COUNT(*)::float                AS "orderCount"
      FROM "Order"
      WHERE "tenantId" = ${tenantId}
        AND status = 'CLOSED'
        AND "createdAt" >= ${start}
        AND "createdAt" <= ${end}
      GROUP BY bucket
      ORDER BY bucket
    `;

    return rows.map((r) => ({
      bucket: r.bucket,
      revenue: Number(r.revenue),
      orderCount: Number(r.orderCount),
    }));
  }

  async getPaymentsSplit(tenantId: string): Promise<PaymentMethodStatsDto[]> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { timezone: true },
    });

    const { start, end } = getDayBoundsUtc(tenant.timezone);

    const rows = await this.prisma.paymentTransaction.groupBy({
      by: ['method'],
      where: { tenantId, createdAt: { gte: start, lte: end } },
      _sum: { amount: true },
      _count: { id: true },
    });

    const allMethods: PaymentMethodKey[] = Object.values(PaymentMethod) as PaymentMethodKey[];

    return allMethods.map((method) => {
      const row = rows.find((r) => r.method === method);
      return {
        method,
        amount: row ? Number(row._sum.amount ?? 0) : 0,
        transactionCount: row ? row._count.id : 0,
      };
    });
  }

  async getTips(tenantId: string): Promise<WaiterTipsDto[]> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { timezone: true },
    });

    const { start, end } = getDayBoundsUtc(tenant.timezone);

    const rows = await this.prisma.tip.groupBy({
      by: ['waiterId'],
      where: { tenantId, createdAt: { gte: start, lte: end } },
      _sum: { amount: true },
      _count: { id: true },
    });

    return rows.map((r) => ({
      waiterId: r.waiterId,
      totalAmount: Number(r._sum.amount ?? 0),
      transactionCount: r._count.id,
    }));
  }
}
