import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-413: закрытие смены, отчёт СКНО и сброс счётчика', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('формирует отчёт при закрытии смены и сбрасывает daily_order_number', async () => {
    const cashier = await fixture.createStaff();
    await fixture.prisma.tenant.update({ where: { id: fixture.tenantId }, data: { dailyOrderNumber: 17 } });
    const openResponse = await fixture.adminRequest().post('/api/v1/admin/shifts/open').send({ cashier_id: cashier.id }).expect(201);
    const opened = openResponse.body as { id: string; status: string };
    expect(opened.status).toBe('OPEN');

    const closeResponse = await fixture.adminRequest().post('/api/v1/admin/shifts/close').expect(201);
    const closed = closeResponse.body as { id: string; status: string; report: { shiftId: string; cashierId: string; orderCount: number; closedAt: string } };
    expect(closed).toMatchObject({ id: opened.id, status: 'CLOSED', report: { shiftId: opened.id, cashierId: cashier.id, orderCount: 0 } });
    expect(closed.report.closedAt).toBeTruthy();
    const tenant = await fixture.prisma.tenant.findUniqueOrThrow({ where: { id: fixture.tenantId } });
    expect(tenant.dailyOrderNumber).toBe(0);
    await fixture.adminRequest().get('/api/v1/admin/shifts/current').expect(200).expect(({ body }) => {
      expect(body).toBeNull();
    });
  });
});
