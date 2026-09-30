import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-539 analytics daily summary (e2e)', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('returns shift metrics and an empty top-dishes list when there are no paid orders', async () => {
    const response = await fixture.adminRequest().get('/api/v1/admin/analytics/daily-summary').expect(200);

    expect(response.body).toMatchObject({
      revenueByn: 0,
      averageCheckByn: 0,
      ordersCount: 0,
      tablesOccupancyPercent: 0,
      pos: { configured: false, pingMs: null },
      topDishes: [],
    });
  });
});
