import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

type GuestMenu = Array<{
  id: string;
  name: string;
  items: Array<{
    id: string;
    name: string;
    modifierGroups: Array<{
      modifierGroup: {
        id: string;
        name: string;
        modifiers: Array<{ id: string; name: string }>;
      };
    }>;
  }>;
}>;

describe('BNP-340: guest menu cache', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  it('stores the guest menu in Redis with a 60-second TTL and refreshes it after expiration', async () => {
    await fixture.redis.del(fixture.cacheKey);

    const firstResponse = await request(fixture.app.getHttpServer())
      .get(`/api/v1/guest/menu?tenantId=${fixture.tenantId}`)
      .set('Authorization', `Bearer ${fixture.token()}`)
      .expect(200);
    const firstMenu = firstResponse.body as unknown as GuestMenu;
    expect(firstMenu[0]).toMatchObject({
      id: fixture.categoryId,
      name: 'Coffee',
      items: [
        {
          id: fixture.itemId,
          name: 'Espresso',
          modifierGroups: [
            {
              modifierGroup: {
                id: fixture.modifierGroupId,
                name: 'Milk options',
                modifiers: [{ id: fixture.modifierId, name: 'Oat milk' }],
              },
            },
          ],
        },
      ],
    });
    expect(firstMenu[0].items[0].name).toBe('Espresso');
    const cachedValue = await fixture.redis.get(fixture.cacheKey);
    expect(cachedValue).not.toBeNull();
    expect(JSON.parse(cachedValue!)).toEqual(firstResponse.body);
    expect(await fixture.redis.ttl(fixture.cacheKey)).toBeGreaterThan(0);
    expect(await fixture.redis.ttl(fixture.cacheKey)).toBeLessThanOrEqual(60);

    await fixture.prisma.menuItem.update({
      where: {
        tenantId_id: { tenantId: fixture.tenantId, id: fixture.itemId },
      },
      data: { name: 'Double espresso' },
    });
    const cachedResponse = await request(fixture.app.getHttpServer())
      .get(`/api/v1/guest/menu?tenantId=${fixture.tenantId}`)
      .set('Authorization', `Bearer ${fixture.token()}`)
      .expect(200);
    const cachedMenu = cachedResponse.body as unknown as GuestMenu;
    expect(cachedMenu[0].items[0].name).toBe('Espresso');

    await fixture.redis.expire(fixture.cacheKey, 1);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const refreshedResponse = await request(fixture.app.getHttpServer())
      .get(`/api/v1/guest/menu?tenantId=${fixture.tenantId}`)
      .set('Authorization', `Bearer ${fixture.token()}`)
      .expect(200);
    const refreshedMenu = refreshedResponse.body as unknown as GuestMenu;
    expect(refreshedMenu[0].items[0].name).toBe('Double espresso');
    expect(await fixture.redis.get(fixture.cacheKey)).not.toBeNull();
    expect(await fixture.redis.ttl(fixture.cacheKey)).toBeGreaterThan(0);
  });
});
