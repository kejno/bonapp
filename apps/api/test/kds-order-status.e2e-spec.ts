import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('KDS order status API', () => {
  const fixture = new MenuCacheTestFixture();
  type KdsOrderList = { orders: Array<{ id: string; status: string }> };
  let servedOrderId: string;
  let cookingOrderId: string;

  beforeAll(async () => {
    await fixture.start();
    const area = await fixture.prisma.diningArea.create({
      data: { tenantId: fixture.tenantId, name: 'Зал' },
    });
    const table = await fixture.prisma.table.create({
      data: {
        tenantId: fixture.tenantId,
        areaId: area.id,
        tableNumber: 1,
        qrToken: `kds-${fixture.tenantId}`,
      },
    });

    const servedOrder = await fixture.prisma.order.create({
      data: {
        tenantId: fixture.tenantId,
        tableId: table.id,
        dailyOrderNumber: 1,
        status: 'SERVED',
        items: {
          create: {
            itemId: fixture.itemId,
            quantity: 1,
            unitPriceByn: '3.50',
            selectedModifiers: {},
            status: 'SERVED',
            kitchenDepartment: 'HOT',
          },
        },
      },
    });
    servedOrderId = servedOrder.id;

    const cookingOrder = await fixture.prisma.order.create({
      data: {
        tenantId: fixture.tenantId,
        tableId: table.id,
        dailyOrderNumber: 2,
        status: 'COOKING',
        items: {
          create: {
            itemId: fixture.itemId,
            quantity: 1,
            unitPriceByn: '3.50',
            selectedModifiers: {},
            status: 'COOKING',
            kitchenDepartment: 'HOT',
          },
        },
      },
    });
    cookingOrderId = cookingOrder.id;
  }, 120_000);

  afterAll(async () => fixture.stop());

  const authorization = () => ({
    Authorization: `Bearer ${fixture.token('OWNER')}`,
  });

  it('returns orders already marked as served in the KDS list', async () => {
    const response = await request(fixture.app.getHttpServer())
      .get('/api/v1/orders/kds')
      .set(authorization())
      .expect(200);
    const body = response.body as KdsOrderList;

    expect(
      body.orders.find((order) => order.id === servedOrderId)?.status,
    ).toBe('SERVED');
  });

  it('moves a cooking order to served through the KDS status endpoint', async () => {
    const response = await request(fixture.app.getHttpServer())
      .patch(`/api/v1/orders/${cookingOrderId}/kds-status`)
      .set(authorization())
      .send({ status: 'SERVED' })
      .expect(200);
    const updatedOrder = response.body as { status: string };

    expect(updatedOrder.status).toBe('SERVED');

    const list = await request(fixture.app.getHttpServer())
      .get('/api/v1/orders/kds')
      .set(authorization())
      .expect(200);
    const listBody = list.body as KdsOrderList;
    expect(
      listBody.orders.find((order) => order.id === cookingOrderId)?.status,
    ).toBe('SERVED');
  });

  it('lets a manager assign kitchen departments to a chef', async () => {
    const chef = await fixture.prisma.user.create({
      data: {
        tenantId: fixture.tenantId,
        email: `chef-${fixture.tenantId}@example.com`,
        passwordHash: 'test-hash',
        fullName: 'Повар KDS',
        role: 'CHEF',
      },
    });

    const response = await request(fixture.app.getHttpServer())
      .put(`/api/v1/admin/staff/${chef.id}/kitchen-departments`)
      .set(authorization())
      .send({ kitchenDepartments: ['HOT', 'BAR'] })
      .expect(200);

    expect(response.body).toEqual({
      id: chef.id,
      kitchenDepartments: ['HOT', 'BAR'],
    });
  });
});
