import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Granularity,
  PaymentMethod,
  RevenueResponse,
  PaymentSplitResponse,
  TipsResponse,
  ZReportResponse,
} from '@bonapp/shared-types';
import { PrismaService } from '../prisma/prisma.service';

const METHOD_LABELS: Record<string, string> = {
  OPLATI: 'Оплати™',
  ERIP: 'ЕРИП',
  CARD: 'Карты',
  CASH: 'Наличные',
};

type RevenueRow = { timestamp: Date; revenue: Prisma.Decimal | string };
type SplitRow = { method: string; amount: Prisma.Decimal | string };
type TipRow = {
  waiterId: string;
  waiterName: string;
  tableCount: bigint;
  tipsTotal: Prisma.Decimal | string;
};
type ShiftRow = { id: string; openedAt: Date; closedAt: Date | null };
type RefundRow = { total: Prisma.Decimal | string };
type CountRow = { count: bigint };
type TransactionRow = {
  id: string;
  method: string;
  amount: Prisma.Decimal | string;
  tipAmount: Prisma.Decimal | string;
  refunded: boolean;
  createdAt: Date;
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRevenue(
    tenantId: string,
    from: Date,
    to: Date,
    granularity: Granularity,
  ): Promise<RevenueResponse> {
    const rows = await this.prisma.$queryRaw<RevenueRow[]>`
      SELECT
        date_trunc(${granularity}, p."createdAt") AS timestamp,
        COALESCE(SUM(p.amount), 0) AS revenue
      FROM "Payment" p
      WHERE p."tenantId" = ${tenantId}
        AND p."createdAt" >= ${from}
        AND p."createdAt" <= ${to}
        AND p.refunded = false
      GROUP BY date_trunc(${granularity}, p."createdAt")
      ORDER BY timestamp ASC
    `;

    return {
      data: rows.map((r) => ({
        timestamp: r.timestamp.toISOString(),
        revenue: Number(r.revenue),
      })),
      granularity,
    };
  }

  async getPaymentSplit(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<PaymentSplitResponse> {
    const rows = await this.prisma.$queryRaw<SplitRow[]>`
      SELECT
        p.method,
        COALESCE(SUM(p.amount), 0) AS amount
      FROM "Payment" p
      WHERE p."tenantId" = ${tenantId}
        AND p."createdAt" >= ${from}
        AND p."createdAt" <= ${to}
        AND p.refunded = false
      GROUP BY p.method
    `;

    const total = rows.reduce((sum, r) => sum + Number(r.amount), 0);

    const items = rows
      .filter((r) => Number(r.amount) > 0)
      .map((r) => ({
        method: r.method as PaymentMethod,
        label: METHOD_LABELS[r.method] ?? r.method,
        amount: Number(r.amount),
        percentage: total > 0 ? Math.round((Number(r.amount) / total) * 100) : 0,
      }));

    return { items, total };
  }

  async getTips(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<TipsResponse> {
    const rows = await this.prisma.$queryRaw<TipRow[]>`
      SELECT
        o."waiterId",
        u.email AS "waiterName",
        COUNT(DISTINCT o.id) AS "tableCount",
        COALESCE(SUM(p."tipAmount"), 0) AS "tipsTotal"
      FROM "Payment" p
      JOIN "Order" o ON p."orderId" = o.id
      JOIN "User" u ON o."waiterId" = u.id
      WHERE p."tenantId" = ${tenantId}
        AND p."createdAt" >= ${from}
        AND p."createdAt" <= ${to}
      GROUP BY o."waiterId", u.email
      ORDER BY "tipsTotal" DESC
    `;

    return {
      rows: rows.map((r) => ({
        waiterId: r.waiterId,
        waiterName: r.waiterName,
        tableCount: Number(r.tableCount),
        tipsTotal: Number(r.tipsTotal),
      })),
    };
  }

  async getZReport(tenantId: string): Promise<ZReportResponse> {
    const shifts = await this.prisma.$queryRaw<ShiftRow[]>`
      SELECT id, "openedAt", "closedAt"
      FROM "Shift"
      WHERE "tenantId" = ${tenantId}
      ORDER BY "openedAt" DESC
      LIMIT 1
    `;

    const shift = shifts[0];
    if (!shift) {
      return { status: 'not_found', receiptCount: 0, revenue: [], refundTotal: 0 };
    }

    const revenueRows = await this.prisma.$queryRaw<SplitRow[]>`
      SELECT
        p.method,
        COALESCE(SUM(p.amount), 0) AS amount
      FROM "Payment" p
      JOIN "Order" o ON p."orderId" = o.id
      WHERE o."shiftId" = ${shift.id}
        AND p.refunded = false
      GROUP BY p.method
    `;

    const [refundRow] = await this.prisma.$queryRaw<RefundRow[]>`
      SELECT COALESCE(SUM(p.amount), 0) AS total
      FROM "Payment" p
      JOIN "Order" o ON p."orderId" = o.id
      WHERE o."shiftId" = ${shift.id}
        AND p.refunded = true
    `;

    const [countRow] = await this.prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(DISTINCT o.id) AS count
      FROM "Order" o
      WHERE o."shiftId" = ${shift.id}
        AND o.status = 'CLOSED'
    `;

    const result: ZReportResponse = {
      status: shift.closedAt ? 'closed' : 'open',
      shiftId: shift.id,
      openedAt: shift.openedAt.toISOString(),
      receiptCount: Number(countRow.count),
      revenue: revenueRows.map((r) => ({
        method: r.method as PaymentMethod,
        label: METHOD_LABELS[r.method] ?? r.method,
        amount: Number(r.amount),
      })),
      refundTotal: Number(refundRow.total),
    };

    if (shift.closedAt) {
      result.closedAt = shift.closedAt.toISOString();
    }

    return result;
  }

  async exportTransactionsCsv(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<string> {
    const rows = await this.prisma.$queryRaw<TransactionRow[]>`
      SELECT
        p.id,
        p.method,
        p.amount,
        p."tipAmount",
        p.refunded,
        p."createdAt"
      FROM "Payment" p
      WHERE p."tenantId" = ${tenantId}
        AND p."createdAt" >= ${from}
        AND p."createdAt" <= ${to}
      ORDER BY p."createdAt" DESC
    `;

    const header = 'id,method,amount,tip_amount,refunded,created_at';
    const lines = rows.map((r) =>
      [
        r.id,
        r.method,
        Number(r.amount),
        Number(r.tipAmount),
        r.refunded,
        r.createdAt.toISOString(),
      ].join(','),
    );

    return [header, ...lines].join('\n');
  }
}
