import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-358: first GET after cache miss populates Redis with TTL ≤ 60s', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  it('creates menu:tenant:{tenantId} key in Redis with correct JSON and TTL after cache invalidation', async () => {
    await fixture.redis.del(fixture.cacheKey);
    expect(await fixture.redis.get(fixture.cacheKey)).toBeNull();

    const response = await request(fixture.app.getHttpServer())
      .get('/api/v1/guest/menu').set('X-QR-Token', fixture.qrToken)
      .set('Authorization', `Bearer ${fixture.token()}`)
      .expect(200);

    const cachedValue = await fixture.redis.get(fixture.cacheKey);
    expect(cachedValue).not.toBeNull();
    expect(JSON.parse(cachedValue!)).toEqual(response.body);

    const ttl = await fixture.redis.ttl(fixture.cacheKey);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });
});
