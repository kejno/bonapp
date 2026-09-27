import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-425: order details', () => {
  const fixture = new MenuCacheTestFixture();
  beforeAll(async () => fixture.start(), 120_000);
  afterAll(async () => fixture.stop());

  it('returns order items and payment records', async () => {
    const auth = { Authorization: `Bearer ${fixture.token()}` };
    const created = await request(fixture.app.getHttpServer()).post('/api/v1/admin/orders').set(auth)
      .send({ tableId: fixture.tableId, phone: '+375291234568' }).expect(201) as unknown as { body: { id: string } };
    await fixture.prisma.orderItem.create({ data: {
      orderId: created.body.id, itemId: fixture.itemId, quantity: 2, unitPriceByn: '3.50',
      selectedModifiers: [], status: 'NEW', kitchenDepartment: 'HOT',
    } });
    await fixture.prisma.payment.create({ data: {
      tenantId: fixture.tenantId, orderId: created.body.id, amountByn: '7.00',
      provider: 'test-provider', status: 'PENDING',
    } });
    const details = await request(fixture.app.getHttpServer()).get(`/api/v1/admin/orders/${created.body.id}`).set(auth).expect(200) as unknown as {
      body: { items: Array<{ itemId: string; quantity: number }>; payments: Array<{ provider: string; status: string }> };
    };
    expect(details.body.items).toHaveLength(1);
    expect(details.body.items[0]).toMatchObject({ itemId: fixture.itemId, quantity: 2 });
    expect(details.body.payments).toHaveLength(1);
    expect(details.body.payments[0]).toMatchObject({ provider: 'test-provider', status: 'PENDING' });
  });
});
