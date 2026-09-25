import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-369: admin menu API authentication', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => fixture.start(), 120_000);
  afterAll(async () => fixture.stop());

  it('rejects unauthenticated menu and media requests without changing persisted data', async () => {
    const authorization = { Authorization: `Bearer ${fixture.token()}` };
    const categoriesUrl = '/api/v1/admin/menu/categories';
    const itemsUrl = '/api/v1/admin/menu/items';
    const beforeCategories = await request(fixture.app.getHttpServer())
      .get(categoriesUrl)
      .set(authorization)
      .expect(200);
    const beforeItems = await request(fixture.app.getHttpServer())
      .get(itemsUrl)
      .set(authorization)
      .expect(200);
    expect(beforeCategories.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixture.categoryId }),
      ]),
    );
    expect(beforeItems.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: fixture.itemId })]),
    );

    await request(fixture.app.getHttpServer()).get(categoriesUrl).expect(401);
    await request(fixture.app.getHttpServer())
      .post(categoriesUrl)
      .send({ name: 'No auth', sortOrder: 1, isVisible: true })
      .expect(401);
    await request(fixture.app.getHttpServer())
      .put(`${categoriesUrl}/${fixture.categoryId}`)
      .send({ name: 'Changed without auth', sortOrder: 99, isVisible: false })
      .expect(401);
    await request(fixture.app.getHttpServer())
      .delete(`${categoriesUrl}/${fixture.categoryId}`)
      .expect(401);

    await request(fixture.app.getHttpServer()).get(itemsUrl).expect(401);
    await request(fixture.app.getHttpServer())
      .post(itemsUrl)
      .send({ name: 'No auth', categoryId: fixture.categoryId, price: 100 })
      .expect(401);
    await request(fixture.app.getHttpServer())
      .put(`${itemsUrl}/${fixture.itemId}`)
      .send({ name: 'Changed without auth', price: 999, isActive: false })
      .expect(401);
    await request(fixture.app.getHttpServer())
      .delete(`${itemsUrl}/${fixture.itemId}`)
      .expect(401);

    const presign = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/media/presign')
      .send({ contentType: 'image/jpeg' })
      .expect(401);
    expect(presign.body).not.toHaveProperty('uploadUrl');
    expect(presign.body).not.toHaveProperty('imageUrl');

    const afterCategories = await request(fixture.app.getHttpServer())
      .get(categoriesUrl)
      .set(authorization)
      .expect(200);
    const afterItems = await request(fixture.app.getHttpServer())
      .get(itemsUrl)
      .set(authorization)
      .expect(200);
    expect(afterCategories.body).toEqual(beforeCategories.body);
    expect(afterItems.body).toEqual(beforeItems.body);
  });
});
