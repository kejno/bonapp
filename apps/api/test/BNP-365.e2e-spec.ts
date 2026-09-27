import request from 'supertest';
import { MenuGateway } from '../src/menu/menu.gateway';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-365: reject a non-boolean stop-list value', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  it.each(['true', 1, null])('rejects %p without changing the item', async (value) => {
    const authorization = { Authorization: `Bearer ${fixture.token()}` };
    const gateway = fixture.app.get(MenuGateway);
    const emitStopListChanged = jest.spyOn(gateway, 'emitStopListChanged');

    await request(fixture.app.getHttpServer())
      .get('/api/v1/guest/menu').set('X-QR-Token', fixture.qrToken)
      .set(authorization)
      .expect(200);
    const cachedMenuBefore = await fixture.redis.get(fixture.cacheKey);
    expect(cachedMenuBefore).not.toBeNull();

    const response = await request(fixture.app.getHttpServer())
      .patch(`/api/v1/admin/menu/items/${fixture.itemId}/stop-list`)
      .set(authorization)
      .send({ isInStopList: value })
      .expect(400);

    expect((response.body as { message: string }).message).toBe('isInStopList is required');
    await expect(
      fixture.prisma.menuItem.findUnique({
        where: { tenantId_id: { tenantId: fixture.tenantId, id: fixture.itemId } },
        select: { isInStopList: true },
      }),
    ).resolves.toEqual({ isInStopList: false });
    expect(emitStopListChanged).not.toHaveBeenCalled();
    await expect(fixture.redis.get(fixture.cacheKey)).resolves.toBe(cachedMenuBefore);
  });
});
