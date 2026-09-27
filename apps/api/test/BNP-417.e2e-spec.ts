import { MenuCacheTestFixture } from './menu-cache-test.fixture';
import request from 'supertest';

describe('BNP-417: KDS drag and drop', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);
  afterAll(async () => fixture.stop());

  it('persists the status change sent when an order is moved to another KDS column', async () => {
    const order = await fixture.prisma.order.create({
      data: {
        tenantId: fixture.tenantId,
        tableId: fixture.tableId,
        dailyOrderNumber: 1,
        status: 'NEW',
      },
    });

    const response = await request(fixture.app.getHttpServer())
      .patch(`/api/v1/orders/${order.id}/kds-status`)
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ status: 'COOKING' })
      .expect(200);

    expect(response.body).toMatchObject({ id: order.id, status: 'COOKING' });
    await expect(
      fixture.prisma.order.findUnique({ where: { id: order.id }, select: { status: true } }),
    ).resolves.toEqual({ status: 'COOKING' });
  });
});
