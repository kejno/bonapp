import request from 'supertest';
import { AuthTestFixture, loginRequest } from './auth-test.fixture';

describe('BNP-362: статус стола и активный заказ сохраняются', () => {
  const fixture = new AuthTestFixture();
  let areaId = '';
  let accessToken = '';

  beforeAll(async () => {
    await fixture.start();
    const area = await fixture.prisma.diningArea.create({ data: { tenantId: fixture.tenantId, name: 'Основной зал' } });
    areaId = area.id;
    const login = await loginRequest(fixture.app.getHttpServer())
      .send({ tenantId: fixture.tenantId, email: fixture.userEmail, password: fixture.userPassword })
      .expect(200);
    accessToken = (login.body as { accessToken: string }).accessToken;
  }, 120_000);
  afterAll(async () => fixture.stop());

  it('сохраняет статус занятого стола в БД и возвращает связанный активный заказ', async () => {
    const table = await fixture.prisma.table.create({
      data: { tenantId: fixture.tenantId, areaId, tableNumber: 21, seatsCount: 2, qrToken: 'qr-bnp-362-test' },
    });
    const order = await fixture.prisma.order.create({
      data: { tenantId: fixture.tenantId, tableId: table.id, dailyOrderNumber: 1, status: 'COOKING', totalAmountByn: 25 },
    });

    await request(fixture.app.getHttpServer()).patch(`/api/v1/admin/tables/${table.id}/status`)
      .set('Authorization', `Bearer ${accessToken}`).send({ status: 'OCCUPIED' }).expect(200);

    expect(await fixture.prisma.table.findUnique({ where: { id: table.id } })).toMatchObject({ status: 'OCCUPIED' });
    const listing = await request(fixture.app.getHttpServer()).get('/api/v1/admin/tables')
      .set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(listing.body).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: table.id,
        status: 'OCCUPIED',
        orders: [expect.objectContaining({ id: order.id, status: 'COOKING' })],
      }),
    ]));
    expect(await fixture.prisma.order.findUnique({ where: { id: order.id } })).toMatchObject({ tableId: table.id, status: 'COOKING' });
  });
});
