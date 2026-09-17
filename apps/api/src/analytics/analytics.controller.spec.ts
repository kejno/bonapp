import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

const mockService = {
  getDailySummary: jest.fn(),
  getRevenue: jest.fn(),
  getPaymentsSplit: jest.fn(),
  getTips: jest.fn(),
};

const TENANT_ID = 'tenant-1';

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

  it('getDailySummary delegates to service', async () => {
    const expected = { date: '2026-09-17', revenueTotal: 0 };
    mockService.getDailySummary.mockResolvedValue(expected);

    const result = await controller.getDailySummary(TENANT_ID);

    expect(mockService.getDailySummary).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toBe(expected);
  });

  it('getRevenue delegates to service with all params', async () => {
    const expected = [{ bucket: '2026-09-17 10:00:00', revenue: 500, orderCount: 2 }];
    mockService.getRevenue.mockResolvedValue(expected);

    const result = await controller.getRevenue(TENANT_ID, '2026-09-17', '2026-09-17', 'hour');

    expect(mockService.getRevenue).toHaveBeenCalledWith(
      TENANT_ID, '2026-09-17', '2026-09-17', 'hour',
    );
    expect(result).toBe(expected);
  });

  it('getRevenue defaults granularity to day when not provided', async () => {
    mockService.getRevenue.mockResolvedValue([]);

    await controller.getRevenue(TENANT_ID, '2026-09-01', '2026-09-17', undefined);

    expect(mockService.getRevenue).toHaveBeenCalledWith(
      TENANT_ID, '2026-09-01', '2026-09-17', 'day',
    );
  });

  it('getPaymentsSplit delegates to service', async () => {
    const expected = [{ method: 'CARD', amount: 100, transactionCount: 1 }];
    mockService.getPaymentsSplit.mockResolvedValue(expected);

    const result = await controller.getPaymentsSplit(TENANT_ID);

    expect(mockService.getPaymentsSplit).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toBe(expected);
  });

  it('getTips delegates to service', async () => {
    const expected = [{ waiterId: 'w1', totalAmount: 50, transactionCount: 1 }];
    mockService.getTips.mockResolvedValue(expected);

    const result = await controller.getTips(TENANT_ID);

    expect(mockService.getTips).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toBe(expected);
  });
});
