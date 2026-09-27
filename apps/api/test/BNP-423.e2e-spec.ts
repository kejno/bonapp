import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-423: administrator order creation', () => {
  const fixture = new MenuCacheTestFixture();
  beforeAll(async () => fixture.start(), 120_000);
  afterAll(async () => fixture.stop());

  it('creates the order for the guest identified by phone and reserves the table', async () => {
    const response = await request(fixture.app.getHttpServer()).post('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ tableId: fixture.tableId, phone: '+375291234569' }).expect(201) as unknown as { body: { id: string } };
    const order = await fixture.prisma.order.findUnique({ where: { id: response.body.id }, include: { guest: true } });
    expect(order).toMatchObject({ tenantId: fixture.tenantId, tableId: fixture.tableId, status: 'NEW' });
    expect(order?.guest).toMatchObject({ phone: '+375291234569' });
    await expect(fixture.prisma.table.findUnique({ where: { id: fixture.tableId }, select: { status: true } }))
      .resolves.toEqual({ status: 'OCCUPIED' });
  });
});
