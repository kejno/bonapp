import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';

const TENANT_ID = 'tenant-1';
const TIMEZONE = 'Europe/Minsk';

const mockPrisma = {
  tenant: { findUniqueOrThrow: jest.fn() },
  order: { aggregate: jest.fn(), count: jest.fn() },
  table: { count: jest.fn() },
  paymentTransaction: { groupBy: jest.fn() },
  tip: { groupBy: jest.fn() },
  $queryRaw: jest.fn(),
};

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<AnalyticsService>(AnalyticsService);
  });

  describe('getDailySummary', () => {
    beforeEach(() => {
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({ timezone: TIMEZONE });
    });

    it('returns zero values when no orders exist', async () => {
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { total: null },
        _count: { id: 0 },
      });
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.order.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      mockPrisma.table.count.mockResolvedValue(5);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getDailySummary(TENANT_ID);

      expect(result.revenueTotal).toBe(0);
      expect(result.avgCheck).toBe(0);
      expect(result.orderCount).toBe(0);
      expect(result.tableOccupancyPercent).toBe(0);
      expect(result.topDishes).toEqual([]);
      expect(result.posPingMs).toBeNull();
    });

    it('returns correct revenue and avgCheck for closed orders', async () => {
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { total: 1500 },
        _count: { id: 3 },
      });
      mockPrisma.order.count.mockResolvedValue(4);
      mockPrisma.table.count.mockResolvedValue(10);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getDailySummary(TENANT_ID);

      expect(result.revenueTotal).toBe(1500);
      expect(result.avgCheck).toBe(500);
      expect(result.orderCount).toBe(4);
    });

    it('returns zero avgCheck when no closed orders', async () => {
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { total: null },
        _count: { id: 0 },
      });
      mockPrisma.order.count.mockResolvedValue(2);
      mockPrisma.table.count.mockResolvedValue(5);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getDailySummary(TENANT_ID);

      expect(result.avgCheck).toBe(0);
    });

    it('returns correct table occupancy percent', async () => {
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { total: null },
        _count: { id: 0 },
      });
      // count is called twice: first for non-cancelled orders, then for open orders
      mockPrisma.order.count
        .mockResolvedValueOnce(0)   // non-cancelled order count
        .mockResolvedValueOnce(3);  // open orders (occupied tables)
      mockPrisma.table.count.mockResolvedValue(10);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getDailySummary(TENANT_ID);

      expect(result.tableOccupancyPercent).toBe(30);
    });

    it('returns 0 occupancy when no active tables', async () => {
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { total: null },
        _count: { id: 0 },
      });
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.table.count.mockResolvedValue(0);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getDailySummary(TENANT_ID);

      expect(result.tableOccupancyPercent).toBe(0);
    });

    it('returns TOP-5 dishes mapped from raw query results', async () => {
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { total: null },
        _count: { id: 0 },
      });
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.table.count.mockResolvedValue(5);
      mockPrisma.$queryRaw.mockResolvedValue([
        { menuItemId: 'item-1', name: 'Бургер', quantitySold: 10, totalRevenue: 300 },
        { menuItemId: 'item-2', name: 'Картошка', quantitySold: 8, totalRevenue: 160 },
      ]);

      const result = await service.getDailySummary(TENANT_ID);

      expect(result.topDishes).toHaveLength(2);
      expect(result.topDishes[0]).toEqual({
        menuItemId: 'item-1',
        name: 'Бургер',
        quantitySold: 10,
        totalRevenue: 300,
      });
    });

    it('includes date field matching tenant timezone day', async () => {
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { total: null },
        _count: { id: 0 },
      });
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.table.count.mockResolvedValue(5);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getDailySummary(TENANT_ID);

      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('getRevenue', () => {
    beforeEach(() => {
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({ timezone: TIMEZONE });
    });

    it('returns empty array when no closed orders in period', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getRevenue(TENANT_ID, '2026-09-17', '2026-09-17', 'hour');

      expect(result).toEqual([]);
    });

    it('returns revenue buckets from raw query', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { bucket: '2026-09-17 10:00:00', revenue: 500, orderCount: 2 },
        { bucket: '2026-09-17 12:00:00', revenue: 800, orderCount: 3 },
      ]);

      const result = await service.getRevenue(TENANT_ID, '2026-09-17', '2026-09-17', 'hour');

      expect(result).toHaveLength(2);
      expect(result[0].revenue).toBe(500);
      expect(result[0].orderCount).toBe(2);
      expect(result[1].revenue).toBe(800);
    });

    it('passes granularity=day to query', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.getRevenue(TENANT_ID, '2026-09-01', '2026-09-17', 'day');

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPaymentsSplit', () => {
    beforeEach(() => {
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({ timezone: TIMEZONE });
    });

    it('returns all four methods with zeros when no payments', async () => {
      mockPrisma.paymentTransaction.groupBy.mockResolvedValue([]);

      const result = await service.getPaymentsSplit(TENANT_ID);

      expect(result).toHaveLength(4);
      const methods = result.map((r) => r.method);
      expect(methods).toContain('OPLATI');
      expect(methods).toContain('ERIP');
      expect(methods).toContain('CARD');
      expect(methods).toContain('CASH');
      result.forEach((r) => {
        expect(r.amount).toBe(0);
        expect(r.transactionCount).toBe(0);
      });
    });

    it('returns correct amounts and counts for existing payments', async () => {
      mockPrisma.paymentTransaction.groupBy.mockResolvedValue([
        { method: 'CARD', _sum: { amount: 1200 }, _count: { id: 5 } },
        { method: 'CASH', _sum: { amount: 300 }, _count: { id: 2 } },
      ]);

      const result = await service.getPaymentsSplit(TENANT_ID);

      const card = result.find((r) => r.method === 'CARD')!;
      const cash = result.find((r) => r.method === 'CASH')!;
      const oplati = result.find((r) => r.method === 'OPLATI')!;

      expect(card.amount).toBe(1200);
      expect(card.transactionCount).toBe(5);
      expect(cash.amount).toBe(300);
      expect(oplati.amount).toBe(0);
    });
  });

  describe('getTips', () => {
    beforeEach(() => {
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({ timezone: TIMEZONE });
    });

    it('returns empty array when no tips today', async () => {
      mockPrisma.tip.groupBy.mockResolvedValue([]);

      const result = await service.getTips(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('returns tips aggregated by waiter', async () => {
      mockPrisma.tip.groupBy.mockResolvedValue([
        { waiterId: 'waiter-1', _sum: { amount: 150 }, _count: { id: 3 } },
        { waiterId: 'waiter-2', _sum: { amount: 80 }, _count: { id: 2 } },
      ]);

      const result = await service.getTips(TENANT_ID);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ waiterId: 'waiter-1', totalAmount: 150, transactionCount: 3 });
      expect(result[1]).toEqual({ waiterId: 'waiter-2', totalAmount: 80, transactionCount: 2 });
    });
  });
});
