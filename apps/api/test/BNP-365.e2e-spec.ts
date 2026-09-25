import request from 'supertest';
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
    const response = await request(fixture.app.getHttpServer())
      .patch(`/api/v1/admin/menu/items/${fixture.itemId}/stop-list`)
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ isInStopList: value })
      .expect(400);

    expect(response.body.message).toBe('isInStopList is required');
    await expect(
      fixture.prisma.menuItem.findUnique({
        where: { tenantId_id: { tenantId: fixture.tenantId, id: fixture.itemId } },
        select: { isInStopList: true },
      }),
    ).resolves.toEqual({ isInStopList: false });
  });
});
