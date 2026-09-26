import { TableStatus } from '@prisma/client';
import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-362: изменение статуса стола', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  it('сохраняет допустимые статусы стола через API', async () => {
    const area = await fixture.prisma.diningArea.create({
      data: { tenantId: fixture.tenantId, name: 'Основной зал' },
    });
    const table = await fixture.prisma.table.create({
      data: {
        tenantId: fixture.tenantId,
        areaId: area.id,
        tableNumber: 41,
        qrToken: `bnp362-${fixture.tenantId}`,
        status: TableStatus.AVAILABLE,
      },
    });

    await expect(
      fixture.prisma.table.findUniqueOrThrow({ where: { id: table.id } }),
    ).resolves.toMatchObject({ status: TableStatus.AVAILABLE });

    for (const status of [TableStatus.OCCUPIED, TableStatus.BILL_REQUESTED]) {
      const response = await request(fixture.app.getHttpServer())
        .patch(`/api/v1/admin/tables/${table.id}/status`)
        .set('Authorization', `Bearer ${fixture.token()}`)
        .send({ status })
        .expect(200);

      expect(response.body).toMatchObject({ id: table.id, status });
      await expect(
        fixture.prisma.table.findUniqueOrThrow({ where: { id: table.id } }),
      ).resolves.toMatchObject({ status });
    }
  });

  it('меняет статус стола при создании заказа и освобождает его после оплаты', async () => {
    const area = await fixture.prisma.diningArea.create({
      data: { tenantId: fixture.tenantId, name: 'Зона заказа' },
    });
    const table = await fixture.prisma.table.create({
      data: {
        tenantId: fixture.tenantId,
        areaId: area.id,
        tableNumber: 42,
        qrToken: `bnp362-order-${fixture.tenantId}`,
        status: TableStatus.AVAILABLE,
      },
    });

    await expect(
      fixture.prisma.table.findUniqueOrThrow({ where: { id: table.id } }),
    ).resolves.toMatchObject({ status: TableStatus.AVAILABLE });

    const orderResponse = await request(fixture.app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ tableId: table.id })
      .expect(201);
    const orderId = (orderResponse.body as { id: string }).id;

    await expect(
      fixture.prisma.table.findUniqueOrThrow({ where: { id: table.id } }),
    ).resolves.toMatchObject({ status: TableStatus.OCCUPIED });

    const listing = await request(fixture.app.getHttpServer())
      .get('/api/v1/admin/tables')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .expect(200);
    expect(listing.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: table.id, status: TableStatus.OCCUPIED }),
      ]),
    );

    await request(fixture.app.getHttpServer())
      .post(`/api/v1/orders/${orderId}/pay`)
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({})
      .expect(200);

    await expect(
      fixture.prisma.table.findUniqueOrThrow({ where: { id: table.id } }),
    ).resolves.toMatchObject({ status: TableStatus.AVAILABLE });
  });
});
