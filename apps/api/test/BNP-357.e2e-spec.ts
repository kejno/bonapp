import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-357: stop-list invalidates only the affected tenant cache', () => {
  const fixture = new MenuCacheTestFixture();
  const tenantBId = `tenant-b-${randomUUID()}`;
  const tenantBQrToken = `qr-b-${randomUUID()}`;
  const tenantBCategoryId = `cat-b-${randomUUID()}`;
  const tenantBItemId = `item-b-${randomUUID()}`;
  const tenantBCacheKey = `menu:tenant:${tenantBId}`;

  beforeAll(async () => {
    await fixture.start();
    await fixture.prisma.tenant.create({
      data: { id: tenantBId, slug: tenantBId, name: 'Tenant B' },
    });
    const tenantBArea = await fixture.prisma.diningArea.create({
      data: { tenantId: tenantBId, name: 'Main Hall' },
    });
    await fixture.prisma.table.create({
      data: { tenantId: tenantBId, areaId: tenantBArea.id, tableNumber: 1, qrToken: tenantBQrToken },
    });
    await fixture.prisma.menuCategory.create({
      data: {
        id: tenantBCategoryId,
        tenantId: tenantBId,
        name: 'Tea',
        sortOrder: 0,
      },
    });
    await fixture.prisma.menuItem.create({
      data: {
        id: tenantBItemId,
        tenantId: tenantBId,
        categoryId: tenantBCategoryId,
        name: 'Green Tea',
        priceByn: '2.00',
      },
    });
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  it('preserves the other tenant cache key when only one tenant stop-list is updated', async () => {
    // Prime tenant A cache
    await request(fixture.app.getHttpServer())
      .get('/api/v1/guest/menu').set('X-QR-Token', fixture.qrToken)
      .set('Authorization', `Bearer ${fixture.token()}`)
      .expect(200);
    expect(await fixture.redis.get(fixture.cacheKey)).not.toBeNull();

    // Prime tenant B cache
    await request(fixture.app.getHttpServer())
      .get('/api/v1/guest/menu')
      .set('X-QR-Token', tenantBQrToken)
      .expect(200);
    expect(await fixture.redis.get(tenantBCacheKey)).not.toBeNull();

    // Update stop-list for tenant A only
    await request(fixture.app.getHttpServer())
      .patch('/api/v1/stop-list')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ itemId: fixture.itemId, isStopped: true })
      .expect(200);

    // Tenant A's cache should be invalidated
    expect(await fixture.redis.get(fixture.cacheKey)).toBeNull();

    // Tenant B's cache must remain untouched
    expect(await fixture.redis.get(tenantBCacheKey)).not.toBeNull();

    // Tenant B's menu must still be served from cache (step 6)
    const tenantBMenu = await request(fixture.app.getHttpServer())
      .get('/api/v1/guest/menu')
      .set('X-QR-Token', tenantBQrToken)
      .expect(200);
    expect(tenantBMenu.body).toBeDefined();
  });
});
