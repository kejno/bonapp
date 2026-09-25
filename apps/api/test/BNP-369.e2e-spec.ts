import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-369: admin menu API authentication', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => fixture.start(), 120_000);
  afterAll(async () => fixture.stop());

  it('rejects unauthenticated menu and media requests without changing persisted data', async () => {
    const beforeCategories = await fixture.prisma.menuCategory.count({ where: { tenantId: fixture.tenantId } });
    const beforeItems = await fixture.prisma.menuItem.count({ where: { tenantId: fixture.tenantId } });

    await request(fixture.app.getHttpServer()).get('/api/v1/admin/menu/categories').expect(401);
    await request(fixture.app.getHttpServer()).post('/api/v1/admin/menu/categories').send({ name: 'No auth', sortOrder: 1, isVisible: true }).expect(401);
    await request(fixture.app.getHttpServer()).get('/api/v1/admin/menu/items').expect(401);
    await request(fixture.app.getHttpServer()).post('/api/v1/admin/menu/items').send({ name: 'No auth', categoryId: fixture.categoryId, price: 100 }).expect(401);
    await request(fixture.app.getHttpServer()).post('/api/v1/admin/media/presign').send({ contentType: 'image/jpeg' }).expect(401);

    await expect(fixture.prisma.menuCategory.count({ where: { tenantId: fixture.tenantId } })).resolves.toBe(beforeCategories);
    await expect(fixture.prisma.menuItem.count({ where: { tenantId: fixture.tenantId } })).resolves.toBe(beforeItems);
  });
});
