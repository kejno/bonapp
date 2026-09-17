import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import type { RevenueResponse, PaymentSplitResponse, TipsResponse, ZReportResponse } from '@bonapp/shared-types';

const mockService = {
  getRevenue: jest.fn(),
  getPaymentSplit: jest.fn(),
  getTips: jest.fn(),
  getZReport: jest.fn(),
  exportTransactionsCsv: jest.fn(),
};

describe('AnalyticsController', () => {
  let controller: AnalyticsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [{ provide: AnalyticsService, useValue: mockService }],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
  });

  describe('getRevenue', () => {
    it('calls service with parsed dates and granularity', async () => {
      const expected: RevenueResponse = { data: [], granularity: 'hour' };
      mockService.getRevenue.mockResolvedValueOnce(expected);

      const result = await controller.getRevenue(
        'tenant-1',
        '2026-09-17T00:00:00Z',
        '2026-09-17T23:59:59Z',
        'hour',
      );

      expect(mockService.getRevenue).toHaveBeenCalledWith(
        'tenant-1',
        new Date('2026-09-17T00:00:00Z'),
        new Date('2026-09-17T23:59:59Z'),
        'hour',
      );
      expect(result).toBe(expected);
    });

    it('defaults granularity to hour when invalid value given', async () => {
      mockService.getRevenue.mockResolvedValueOnce({ data: [], granularity: 'hour' });

      await controller.getRevenue('t1', '2026-09-17T00:00:00Z', '2026-09-17T23:59:59Z', 'invalid');

      expect(mockService.getRevenue).toHaveBeenCalledWith(
        't1',
        expect.any(Date),
        expect.any(Date),
        'hour',
      );
    });
  });

  describe('getPaymentSplit', () => {
    it('calls service and returns result', async () => {
      const expected: PaymentSplitResponse = { items: [], total: 0 };
      mockService.getPaymentSplit.mockResolvedValueOnce(expected);

      const result = await controller.getPaymentSplit(
        'tenant-1',
        '2026-09-17T00:00:00Z',
        '2026-09-17T23:59:59Z',
      );

      expect(mockService.getPaymentSplit).toHaveBeenCalledWith(
        'tenant-1',
        new Date('2026-09-17T00:00:00Z'),
        new Date('2026-09-17T23:59:59Z'),
      );
      expect(result).toBe(expected);
    });
  });

  describe('getTips', () => {
    it('calls service and returns result', async () => {
      const expected: TipsResponse = { rows: [] };
      mockService.getTips.mockResolvedValueOnce(expected);

      const result = await controller.getTips(
        'tenant-1',
        '2026-09-17T00:00:00Z',
        '2026-09-17T23:59:59Z',
      );

      expect(mockService.getTips).toHaveBeenCalledWith(
        'tenant-1',
        new Date('2026-09-17T00:00:00Z'),
        new Date('2026-09-17T23:59:59Z'),
      );
      expect(result).toBe(expected);
    });
  });

  describe('getZReport', () => {
    it('calls service and returns result', async () => {
      const expected: ZReportResponse = {
        status: 'not_found',
        receiptCount: 0,
        revenue: [],
        refundTotal: 0,
      };
      mockService.getZReport.mockResolvedValueOnce(expected);

      const result = await controller.getZReport('tenant-1');

      expect(mockService.getZReport).toHaveBeenCalledWith('tenant-1');
      expect(result).toBe(expected);
    });
  });

  describe('exportTransactions', () => {
    it('sets CSV headers and streams content', async () => {
      mockService.exportTransactionsCsv.mockResolvedValueOnce(
        'id,method\np1,CASH',
      );

      const res = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };

      await controller.exportTransactions(
        'tenant-1',
        '2026-09-17T00:00:00Z',
        '2026-09-17T23:59:59Z',
        res as never,
      );

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="transactions.csv"',
      );
      expect(res.send).toHaveBeenCalledWith('id,method\np1,CASH');
    });
  });
});
