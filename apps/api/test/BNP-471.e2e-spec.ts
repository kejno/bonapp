import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-471: закрытие текущей смены', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('подтверждает итоги и закрывает смену', async () => {
    const cashier = await fixture.createStaff();
    const openResponse = await fixture.adminRequest().post('/api/v1/admin/shifts/open')
      .send({ cashier_id: cashier.id }).expect(201);
    const opened = openResponse.body as { id: string };
    const closeResponse = await fixture.adminRequest().post('/api/v1/admin/shifts/close').expect(201);
    const closed = closeResponse.body as {
      id: string;
      status: string;
      closedAt: string;
      report: { shiftId: string; cashierId: string; orderCount: number };
    };
    expect(closed).toMatchObject({
      id: opened.id,
      status: 'CLOSED',
      report: { shiftId: opened.id, cashierId: cashier.id, orderCount: 0 },
    });
    expect(closed.closedAt).toBeTruthy();
  });
});
