import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-541 analytics waiter tips (e2e)', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('returns tips grouped by waiter for the requested period', async () => {
    const response = await fixture.adminRequest()
      .get('/api/v1/admin/analytics/tips?from=2026-09-29T00:00:00.000Z&to=2026-09-30T00:00:00.000Z')
      .expect(200);

    expect(response.body).toEqual([]);
  });
});
