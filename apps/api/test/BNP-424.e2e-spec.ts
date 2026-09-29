import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-424: active KDS orders', () => {
  const fixture = new MenuCacheTestFixture();
  beforeAll(async () => fixture.start(), 120_000);
  afterAll(async () => fixture.stop());

  it('returns active statuses and groups equal items by kitchen department', async () => {
    const auth = { Authorization: `Bearer ${fixture.token()}` };
    const active = await fixture.prisma.order.create({ data: { tenantId: fixture.tenantId, tableId: fixture.tableId, dailyOrderNumber: 1, status: 'NEW' } });
    await fixture.prisma.orderItem.createMany({ data: [
      { orderId: active.id, itemId: fixture.itemId, quantity: 1, unitPriceByn: '3.50', selectedModifiers: [], status: 'NEW', kitchenDepartment: 'HOT' },
      { orderId: active.id, itemId: fixture.itemId, quantity: 2, unitPriceByn: '3.50', selectedModifiers: [], status: 'NEW', kitchenDepartment: 'HOT' },
      { orderId: active.id, itemId: fixture.itemId, quantity: 1, unitPriceByn: '3.50', selectedModifiers: [], status: 'NEW', kitchenDepartment: 'COLD' },
    ] });
    const cooking = await fixture.prisma.order.create({ data: { tenantId: fixture.tenantId, tableId: fixture.tableId, dailyOrderNumber: 2, status: 'COOKING' } });
    const ready = await fixture.prisma.order.create({ data: { tenantId: fixture.tenantId, tableId: fixture.tableId, dailyOrderNumber: 3, status: 'READY' } });
    await fixture.prisma.order.create({ data: { tenantId: fixture.tenantId, tableId: fixture.tableId, dailyOrderNumber: 4, status: 'PAID' } });
    const response = await request(fixture.app.getHttpServer()).get('/api/v1/admin/orders/active').set(auth).expect(200) as unknown as {
      body: Array<{ id: string; status: string; items: Array<{ itemId: string; name: string; quantity: number; kitchenDepartment: string }> }>;
    };
    expect(response.body).toHaveLength(3);
    expect(response.body.map(({ id, status }) => ({ id, status }))).toEqual(expect.arrayContaining([
      { id: active.id, status: 'NEW' },
      { id: cooking.id, status: 'COOKING' },
      { id: ready.id, status: 'READY' },
    ]));
    expect(response.body.find(({ id }) => id === active.id)?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: fixture.itemId, name: 'Espresso', quantity: 3, kitchenDepartment: 'HOT' }),
      expect.objectContaining({ itemId: fixture.itemId, name: 'Espresso', quantity: 1, kitchenDepartment: 'COLD' }),
    ]));
  });
});
