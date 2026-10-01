import { BadRequestException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService.tips', () => {
  type TipsQuery = { where: { createdAt: { gte: Date; lt: Date } } };
  type TipPayment = { tipsAmountByn: number; order: { id?: string; assignedWaiterId: string | null; assignedWaiter: { fullName: string } | null } };
  const findMany = jest.fn<Promise<TipPayment[]>, [TipsQuery]>();
  const tenantFindUnique = jest.fn();
  const service = new AnalyticsService({
    db: {
      tenant: { findUnique: tenantFindUnique },
      payment: { findMany },
    },
  } as never);

  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([]);
    tenantFindUnique.mockReset().mockResolvedValue({ timezone: 'Europe/Minsk' });
  });

  it('uses the requested date range when aggregating waiter tips', async () => {
    findMany.mockResolvedValue([
      { tipsAmountByn: 3, order: { id: 'o1', assignedWaiterId: 'w1', assignedWaiter: { fullName: 'Анна' } } },
      { tipsAmountByn: 0, order: { id: 'o1', assignedWaiterId: 'w1', assignedWaiter: { fullName: 'Анна' } } },
      { tipsAmountByn: 2, order: { id: 'o2', assignedWaiterId: 'w1', assignedWaiter: { fullName: 'Анна' } } },
      { tipsAmountByn: 4, order: { id: 'o3', assignedWaiterId: 'w2', assignedWaiter: { fullName: 'Иван' } } },
    ]);

    await expect(service.tips('tenant-1', '2026-09-28T00:00:00.000Z', '2026-09-30T00:00:00.000Z')).resolves.toEqual([
      { waiterName: 'Анна', tipsByn: 5, transactionsCount: 2 },
      { waiterName: 'Иван', tipsByn: 4, transactionsCount: 1 },
    ]);
    expect(findMany.mock.calls[0][0].where.createdAt).toEqual({
      gte: new Date('2026-09-28T00:00:00.000Z'),
      lt: new Date('2026-09-30T00:00:00.000Z'),
    });
  });

  it('rejects an invalid requested date range', async () => {
    await expect(service.tips('tenant-1', 'bad-date', '2026-09-30T00:00:00.000Z')).rejects.toBeInstanceOf(BadRequestException);
  });
});
