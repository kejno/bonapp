import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-366: menu category CRUD and cascade deletion', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => fixture.start(), 120_000);
  afterAll(async () => fixture.stop());

  it('persists category fields and removes its menu items on deletion', async () => {
    const authorization = { Authorization: `Bearer ${fixture.token()}` };
    const created = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/menu/categories')
      .set(authorization)
      .send({ name: 'Seasonal', sortOrder: 7, isVisible: false, posCategoryId: 'seasonal-366' })
      .expect(201);

    expect(created.body).toMatchObject({ name: 'Seasonal', sortOrder: 7, isVisible: false, posCategoryId: 'seasonal-366' });

    const updated = await request(fixture.app.getHttpServer())
      .put(`/api/v1/admin/menu/categories/${created.body.id}`)
      .set(authorization)
      .send({ name: 'Seasonal menu', sortOrder: 8, isVisible: true })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Seasonal menu', sortOrder: 8, isVisible: true });

    const item = await fixture.prisma.menuItem.create({
      data: { tenantId: fixture.tenantId, categoryId: created.body.id, name: 'Pumpkin soup', priceByn: '8.00' },
    });
    await request(fixture.app.getHttpServer())
      .delete(`/api/v1/admin/menu/categories/${created.body.id}`)
      .set(authorization)
      .expect(204);

    await expect(fixture.prisma.menuItem.findUnique({ where: { id: item.id } })).resolves.toBeNull();
  });
});
