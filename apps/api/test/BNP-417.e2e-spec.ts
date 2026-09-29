import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-417: KDS order status update', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => fixture.start(), 120_000);
  afterAll(async () => fixture.stop());

  it('persists the status selected for an order in the KDS', async () => {
    const authorization = `Bearer ${fixture.token()}`;
    const created = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/orders')
      .set('Authorization', authorization)
      .send({ tableId: fixture.tableId, phone: '+375291234568' })
      .expect(201);
    const orderId = (created.body as { id: string }).id;

    const response = await request(fixture.app.getHttpServer())
      .patch(`/api/v1/admin/orders/${orderId}/status`)
      .set('Authorization', authorization)
      .send({ status: 'COOKING' })
      .expect(200);

    expect(response.body).toMatchObject({ id: orderId, status: 'COOKING' });
    await expect(
      fixture.prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'COOKING' });
  });
});
