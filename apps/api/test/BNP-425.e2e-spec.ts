import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

interface OrderDetailsResponse {
  id: string;
  items: Array<{
    id: string;
    orderId: string;
    itemId: string;
    quantity: number;
    unitPriceByn: string;
    status: string;
  }>;
  payments: Array<{
    id: string;
    orderId: string;
    amountByn: string;
    tipsAmountByn: string;
    status: string;
  }>;
}

describe('BNP-425: получать детали заказа вместе с позициями и платежами', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => fixture.start({ redisAdapter: false }), 120_000);
  afterAll(async () => fixture.stop());

  it('returns all persisted items and payments for an administrator order', async () => {
    const created = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ tableId: fixture.tableId, phone: '29 123 45 67' })
      .expect(201);
    const orderId = (created.body as { id: string }).id;

    await fixture.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${fixture.tenantId}, true)`;
      await tx.orderItem.createMany({
        data: [
          { orderId, itemId: fixture.itemId, quantity: 2, unitPriceByn: '3.50', selectedModifiers: [], status: 'NEW', kitchenDepartment: 'HOT' },
          { orderId, itemId: fixture.itemId, quantity: 1, unitPriceByn: '4.00', selectedModifiers: [], status: 'COOKING', kitchenDepartment: 'HOT' },
        ],
      });
      await tx.payment.create({
        data: {
          tenantId: fixture.tenantId,
          orderId,
          amountByn: '11.00',
          tipsAmountByn: '0.50',
          provider: 'test-provider',
          status: 'SUCCEEDED',
        },
      });
    });

    const stored = await fixture.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true, payments: true },
    });
    const response = await request(fixture.app.getHttpServer())
      .get(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', `Bearer ${fixture.token()}`)
      .expect(200);
    const body = response.body as unknown as OrderDetailsResponse;

    expect(body.id).toBe(orderId);
    expect(body.items).toHaveLength(2);
    expect(
      body.items.map((item) => ({
        id: item.id,
        orderId: item.orderId,
        itemId: item.itemId,
        quantity: item.quantity,
        unitPriceByn: item.unitPriceByn,
        status: item.status,
      })),
    ).toEqual(
      expect.arrayContaining(
        stored.items.map((item) => ({
          id: item.id,
          orderId: item.orderId,
          itemId: item.itemId,
          quantity: item.quantity,
          unitPriceByn: item.unitPriceByn.toString(),
          status: item.status,
        })),
      ),
    );
    expect(body.payments).toHaveLength(1);
    expect(body.payments[0]).toMatchObject({
      id: stored.payments[0].id,
      orderId: stored.payments[0].orderId,
      amountByn: stored.payments[0].amountByn.toString(),
      tipsAmountByn: stored.payments[0].tipsAmountByn.toString(),
      status: stored.payments[0].status,
    });
  }, 120_000);
});
