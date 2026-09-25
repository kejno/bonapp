import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-367: menu item CRUD and filters', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => fixture.start(), 120_000);
  afterAll(async () => fixture.stop());

  it('creates, updates, filters, and deletes menu items', async () => {
    const authorization = { Authorization: `Bearer ${fixture.token()}` };
    const created = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/menu/items')
      .set(authorization)
      .send({ name: 'Flat white', categoryId: fixture.categoryId, price: 450, imageUrl: 'https://images.test/flat-white.jpg' })
      .expect(201);
    expect(created.body).toMatchObject({ name: 'Flat white', categoryId: fixture.categoryId, price: 450 });

    const updated = await request(fixture.app.getHttpServer())
      .put(`/api/v1/admin/menu/items/${created.body.id}`)
      .set(authorization)
      .send({ name: 'Large flat white', price: 550, isActive: false })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Large flat white', price: 550, isActive: false });

    const filtered = await request(fixture.app.getHttpServer())
      .get('/api/v1/admin/menu/items')
      .query({ category: fixture.categoryId, is_active: 'false', is_in_stop_list: 'false' })
      .set(authorization)
      .expect(200);
    expect(filtered.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.body.id, name: 'Large flat white' })]));
    expect(filtered.body).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: fixture.itemId })]));

    await request(fixture.app.getHttpServer())
      .delete(`/api/v1/admin/menu/items/${created.body.id}`)
      .set(authorization)
      .expect(204);
    await expect(fixture.prisma.menuItem.findUnique({ where: { id: created.body.id } })).resolves.toBeNull();
  });
});
