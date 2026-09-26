import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

type GuestMenu = Array<{
  items: Array<{ stopListItem: { isStopped: boolean } }>;
}>;

describe('BNP-343: stop-list invalidates guest menu cache', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  it('removes the Redis key immediately after adding to and removing from the stop-list', async () => {
    await request(fixture.app.getHttpServer())
      .get('/api/v1/guest/menu').set('X-QR-Token', fixture.qrToken)
      .set('Authorization', `Bearer ${fixture.token()}`)
      .expect(200);
    expect(await fixture.redis.get(fixture.cacheKey)).not.toBeNull();

    await request(fixture.app.getHttpServer())
      .patch('/api/v1/stop-list')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ itemId: fixture.itemId, isStopped: true })
      .expect(200);
    expect(await fixture.redis.get(fixture.cacheKey)).toBeNull();

    const stoppedMenu = await request(fixture.app.getHttpServer())
      .get('/api/v1/guest/menu').set('X-QR-Token', fixture.qrToken)
      .set('Authorization', `Bearer ${fixture.token()}`)
      .expect(200);
    const stoppedCatalog = stoppedMenu.body as unknown as GuestMenu;
    expect(stoppedCatalog[0].items[0].stopListItem.isStopped).toBe(true);

    await request(fixture.app.getHttpServer())
      .patch('/api/v1/stop-list')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ itemId: fixture.itemId, isStopped: false })
      .expect(200);
    expect(await fixture.redis.get(fixture.cacheKey)).toBeNull();

    const availableMenu = await request(fixture.app.getHttpServer())
      .get('/api/v1/guest/menu').set('X-QR-Token', fixture.qrToken)
      .set('Authorization', `Bearer ${fixture.token()}`)
      .expect(200);
    const availableCatalog = availableMenu.body as unknown as GuestMenu;
    expect(availableCatalog[0].items[0].stopListItem.isStopped).toBe(false);
  });
});
