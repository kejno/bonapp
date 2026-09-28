import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { tenantLocalDate } from '../src/orders/daily-order-number';
import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-413: закрытие смены, отчёт СКНО и сброс счётчика', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('формирует отчёт при закрытии смены и сбрасывает daily_order_number', async () => {
    const cashier = await fixture.createStaff();
    const tenant = await fixture.prisma.tenant.findUniqueOrThrow({
      where: { id: fixture.tenantId },
      select: { timezone: true },
    });
    await fixture.prisma.tenant.update({
      where: { id: fixture.tenantId },
      data: { dailyOrderNumber: 17, dailyOrderNumberDate: tenantLocalDate(tenant.timezone) },
    });
    const openResponse = await fixture.adminRequest().post('/api/v1/admin/shifts/open').send({ cashier_id: cashier.id }).expect(201);
    const opened = openResponse.body as { id: string; status: string; cashierId: string };
    expect(opened).toMatchObject({ status: 'OPEN', cashierId: cashier.id });

    const closeResponse = await fixture.adminRequest().post('/api/v1/admin/shifts/close').expect(201);
    const closed = closeResponse.body as { id: string; status: string; report: { shiftId: string; cashierId: string; orderCount: number; closedAt: string } };
    expect(closed).toMatchObject({ id: opened.id, status: 'CLOSED', report: { shiftId: opened.id, cashierId: cashier.id, orderCount: 0 } });
    expect(closed.report.closedAt).toBeTruthy();
    await fixture.adminRequest().get('/api/v1/admin/shifts/current').expect(200).expect(({ text }) => {
      expect(text).toBe('');
    });

    const area = await fixture.prisma.diningArea.create({ data: { tenantId: fixture.tenantId, name: 'Основной зал' } });
    const qrToken = `shift-close-${randomUUID()}`;
    await fixture.prisma.table.create({
      data: { tenantId: fixture.tenantId, areaId: area.id, tableNumber: 1, qrToken },
    });
    const category = await fixture.prisma.menuCategory.create({
      data: { tenantId: fixture.tenantId, name: 'Напитки', sortOrder: 1 },
    });
    const menuItem = await fixture.prisma.menuItem.create({
      data: { tenantId: fixture.tenantId, categoryId: category.id, name: 'Вода', priceByn: 2 },
    });
    await request(fixture.app.getHttpServer())
      .post('/api/v1/guest/orders')
      .set('X-QR-Token', qrToken)
      .send({ qrToken, comment: '', items: [{ menuItemId: menuItem.id, quantity: 1, selectedModifiers: [] }] })
      .expect(201)
      .expect(({ body }) => expect(body).toMatchObject({ dailyOrderNumber: 1, totalAmountByn: 2 }));
  });
});
