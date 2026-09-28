import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-423: administrator order creation', () => {
  const fixture = new MenuCacheTestFixture();
  beforeAll(async () => fixture.start(), 120_000);
  afterAll(async () => fixture.stop());

  it('creates the order and menu items for the guest identified by phone', async () => {
    const secondItemId = `item-${Date.now()}`;
    await fixture.prisma.menuItem.create({ data: {
      id: secondItemId,
      tenantId: fixture.tenantId,
      categoryId: fixture.categoryId,
      name: 'Latte',
      priceByn: '5.00',
    } });
    const response = await request(fixture.app.getHttpServer()).post('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({
        tableId: fixture.tableId,
        phone: '+375291234569',
        items: [
          { menuItemId: fixture.itemId, quantity: 2, selectedModifiers: [fixture.modifierId] },
          { menuItemId: secondItemId, quantity: 1, selectedModifiers: [] },
        ],
      }).expect(201) as unknown as { body: { id: string } };
    const order = await fixture.prisma.order.findUnique({ where: { id: response.body.id }, include: { guest: true, items: true } });
    expect(order).toMatchObject({
      tenantId: fixture.tenantId,
      tableId: fixture.tableId,
      status: 'NEW',
      items: [
        { itemId: fixture.itemId, quantity: 2, selectedModifiers: [fixture.modifierId] },
        { itemId: secondItemId, quantity: 1, selectedModifiers: [] },
      ],
    });
    expect(Number(order?.totalAmountByn)).toBe(13);
    expect(Number(order?.items[0].unitPriceByn)).toBe(4);
    expect(Number(order?.items[1].unitPriceByn)).toBe(5);
    expect(order?.guest).toMatchObject({ phone: '+375291234569' });
    const details = await request(fixture.app.getHttpServer()).get(`/api/v1/admin/orders/${response.body.id}`)
      .set('Authorization', `Bearer ${fixture.token()}`).expect(200) as unknown as {
        body: {
          items: Array<{ itemId: string; quantity: number }>;
          totalAmountByn: number;
        };
      };
    expect(details.body).toMatchObject({ items: [
      { itemId: fixture.itemId, quantity: 2 },
      { itemId: secondItemId, quantity: 1 },
    ] });
    expect(Number(details.body.totalAmountByn)).toBe(13);
    await expect(fixture.prisma.table.findUnique({ where: { id: fixture.tableId }, select: { status: true } }))
      .resolves.toEqual({ status: 'OCCUPIED' });
  });
});
