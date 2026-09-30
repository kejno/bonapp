import request from 'supertest';
import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-540 analytics revenue and payment split (e2e)', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('returns hourly revenue for the requested range and all payment methods', async () => {
    const server = fixture.app.getHttpServer();
    const authorization = { Authorization: `Bearer ${fixture.authorization.replace(/^Bearer\s+/i, '')}` };

    const revenue = await request(server)
      .get('/api/v1/admin/analytics/revenue?from=2026-09-29T00:00:00.000Z&to=2026-09-30T00:00:00.000Z&granularity=hour')
      .set(authorization)
      .expect(200);
    expect(revenue.body).toEqual([]);

    const split = await request(server).get('/api/v1/admin/analytics/payments-split').set(authorization).expect(200);
    expect(split.body).toEqual([
      { method: 'OPLATI_QR', amountByn: 0, transactionsCount: 0 },
      { method: 'ERIP_EPOS', amountByn: 0, transactionsCount: 0 },
      { method: 'BANK_CARD', amountByn: 0, transactionsCount: 0 },
      { method: 'CASH_TO_WAITER', amountByn: 0, transactionsCount: 0 },
    ]);
  });
});
