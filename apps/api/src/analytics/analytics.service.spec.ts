import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
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

  const from = new Date('2026-09-17T00:00:00Z');
  const to = new Date('2026-09-17T23:59:59Z');

  describe('getRevenue', () => {
    it('returns mapped revenue data points', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { timestamp: new Date('2026-09-17T10:00:00Z'), revenue: '150.50' },
        { timestamp: new Date('2026-09-17T11:00:00Z'), revenue: '200.00' },
      ]);

      const result = await service.getRevenue('t1', from, to, 'hour');

      expect(result.granularity).toBe('hour');
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({
        timestamp: '2026-09-17T10:00:00.000Z',
        revenue: 150.5,
      });
      expect(result.data[1]).toEqual({
        timestamp: '2026-09-17T11:00:00.000Z',
        revenue: 200,
      });
    });

    it('returns empty data when no payments found', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const result = await service.getRevenue('t1', from, to, 'hour');

      expect(result.data).toHaveLength(0);
      expect(result.granularity).toBe('hour');
    });
  });

  describe('getPaymentSplit', () => {
    it('returns payment split with correct percentages', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { method: 'OPLATI', amount: '300.00' },
        { method: 'CASH', amount: '100.00' },
      ]);

      const result = await service.getPaymentSplit('t1', from, to);

      expect(result.total).toBe(400);
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toMatchObject({
        method: 'OPLATI',
        label: 'Оплати™',
        amount: 300,
        percentage: 75,
      });
      expect(result.items[1]).toMatchObject({
        method: 'CASH',
        label: 'Наличные',
        amount: 100,
        percentage: 25,
      });
    });

    it('filters out zero-amount payment methods', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { method: 'OPLATI', amount: '100.00' },
        { method: 'CARD', amount: '0.00' },
      ]);

      const result = await service.getPaymentSplit('t1', from, to);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].method).toBe('OPLATI');
    });

    it('returns zero total when no payments', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const result = await service.getPaymentSplit('t1', from, to);

      expect(result.total).toBe(0);
      expect(result.items).toHaveLength(0);
    });
  });

  describe('getTips', () => {
    it('returns mapped tips rows', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          waiterId: 'w1',
          waiterName: 'alice@test.com',
          tableCount: BigInt(3),
          tipsTotal: '50.00',
        },
        {
          waiterId: 'w2',
          waiterName: 'bob@test.com',
          tableCount: BigInt(1),
          tipsTotal: '20.00',
        },
      ]);

      const result = await service.getTips('t1', from, to);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({
        waiterId: 'w1',
        waiterName: 'alice@test.com',
        tableCount: 3,
        tipsTotal: 50,
      });
      expect(result.rows[1]).toEqual({
        waiterId: 'w2',
        waiterName: 'bob@test.com',
        tableCount: 1,
        tipsTotal: 20,
      });
    });

    it('returns empty rows when no tips found', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const result = await service.getTips('t1', from, to);

      expect(result.rows).toHaveLength(0);
    });
  });

  describe('getZReport', () => {
    it('returns not_found when no shifts exist', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const result = await service.getZReport('t1');

      expect(result.status).toBe('not_found');
      expect(result.receiptCount).toBe(0);
      expect(result.revenue).toHaveLength(0);
      expect(result.refundTotal).toBe(0);
    });

    it('returns open shift with aggregated revenue', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([
          {
            id: 'shift-1',
            openedAt: new Date('2026-09-17T08:00:00Z'),
            closedAt: null,
          },
        ])
        .mockResolvedValueOnce([{ method: 'CASH', amount: '500.00' }])
        .mockResolvedValueOnce([{ total: '0.00' }])
        .mockResolvedValueOnce([{ count: BigInt(5) }]);

      const result = await service.getZReport('t1');

      expect(result.status).toBe('open');
      expect(result.shiftId).toBe('shift-1');
      expect(result.openedAt).toBe('2026-09-17T08:00:00.000Z');
      expect(result.closedAt).toBeUndefined();
      expect(result.receiptCount).toBe(5);
      expect(result.revenue).toHaveLength(1);
      expect(result.revenue[0]).toMatchObject({ method: 'CASH', amount: 500 });
      expect(result.refundTotal).toBe(0);
    });

    it('returns closed shift with closing timestamp', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([
          {
            id: 'shift-2',
            openedAt: new Date('2026-09-16T08:00:00Z'),
            closedAt: new Date('2026-09-16T22:00:00Z'),
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: '50.00' }])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);

      const result = await service.getZReport('t1');

      expect(result.status).toBe('closed');
      expect(result.closedAt).toBe('2026-09-16T22:00:00.000Z');
      expect(result.refundTotal).toBe(50);
    });

    it('returns revenue items for multiple payment methods', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([
          { id: 'shift-3', openedAt: new Date('2026-09-17T08:00:00Z'), closedAt: null },
        ])
        .mockResolvedValueOnce([
          { method: 'OPLATI', amount: '300.00' },
          { method: 'ERIP', amount: '150.00' },
        ])
        .mockResolvedValueOnce([{ total: '0.00' }])
        .mockResolvedValueOnce([{ count: BigInt(7) }]);

      const result = await service.getZReport('t1');

      expect(result.revenue).toHaveLength(2);
      expect(result.revenue[0]).toMatchObject({ method: 'OPLATI', label: 'Оплати™', amount: 300 });
      expect(result.revenue[1]).toMatchObject({ method: 'ERIP', label: 'ЕРИП', amount: 150 });
    });
  });

  describe('exportTransactionsCsv', () => {
    it('returns CSV with header and data rows', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'p1',
          method: 'CASH',
          amount: '100.00',
          tipAmount: '10.00',
          refunded: false,
          createdAt: new Date('2026-09-17T12:00:00Z'),
        },
        {
          id: 'p2',
          method: 'OPLATI',
          amount: '250.00',
          tipAmount: '0.00',
          refunded: false,
          createdAt: new Date('2026-09-17T14:00:00Z'),
        },
      ]);

      const csv = await service.exportTransactionsCsv('t1', from, to);
      const lines = csv.split('\n');

      expect(lines[0]).toBe('id,method,amount,tip_amount,refunded,created_at');
      expect(lines).toHaveLength(3);
      expect(lines[1]).toBe('p1,CASH,100,10,false,2026-09-17T12:00:00.000Z');
      expect(lines[2]).toBe('p2,OPLATI,250,0,false,2026-09-17T14:00:00.000Z');
    });

    it('returns header-only CSV when no transactions', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const csv = await service.exportTransactionsCsv('t1', from, to);
      const lines = csv.split('\n');

      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe('id,method,amount,tip_amount,refunded,created_at');
    });
  });
});
