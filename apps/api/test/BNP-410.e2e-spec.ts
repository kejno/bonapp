import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-410: состояние смены', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('открывает смену, возвращает её как текущую и закрывает с итоговым отчётом', async () => {
    const cashier = await fixture.createStaff();
    const openResponse = await fixture.adminRequest().post('/api/v1/admin/shifts/open').send({ cashier_id: cashier.id }).expect(201);
    const opened = openResponse.body as { id: string; cashierId: string; status: string };
    expect(opened).toMatchObject({ cashierId: cashier.id, status: 'OPEN' });

    const currentResponse = await fixture.adminRequest().get('/api/v1/admin/shifts/current').expect(200);
    const current = currentResponse.body as { id: string; status: string; cashier: { id: string } };
    expect(current).toMatchObject({ id: opened.id, status: 'OPEN', cashier: { id: cashier.id } });

    const closeResponse = await fixture.adminRequest().post('/api/v1/admin/shifts/close').expect(201);
    const closed = closeResponse.body as { id: string; status: string; closedAt: string; report: { shiftId: string; cashierId: string; orderCount: number } };
    expect(closed).toMatchObject({ id: opened.id, status: 'CLOSED', report: { shiftId: opened.id, cashierId: cashier.id, orderCount: 0 } });
    expect(closed.closedAt).toBeTruthy();
    const currentAfterClose = await fixture.adminRequest().get('/api/v1/admin/shifts/current').expect(200);
    expect(currentAfterClose.body).toBeNull();
  });
});
