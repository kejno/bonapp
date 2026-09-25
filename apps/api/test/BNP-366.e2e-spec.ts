import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

type CategoryResponse = { id: string };

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
    const createdCategory = created.body as CategoryResponse;

    expect(created.body).toMatchObject({ name: 'Seasonal', sortOrder: 7, isVisible: false, posCategoryId: 'seasonal-366' });

    const updated = await request(fixture.app.getHttpServer())
      .put(`/api/v1/admin/menu/categories/${createdCategory.id}`)
      .set(authorization)
      .send({ name: 'Seasonal menu', sortOrder: 8, isVisible: true })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Seasonal menu', sortOrder: 8, isVisible: true });

    const item = await fixture.prisma.menuItem.create({
      data: { tenantId: fixture.tenantId, categoryId: createdCategory.id, name: 'Pumpkin soup', priceByn: '8.00' },
    });
    await request(fixture.app.getHttpServer())
      .delete(`/api/v1/admin/menu/categories/${createdCategory.id}`)
      .set(authorization)
      .expect(204);

    await expect(fixture.prisma.menuItem.findUnique({ where: { id: item.id } })).resolves.toBeNull();
  });
});
