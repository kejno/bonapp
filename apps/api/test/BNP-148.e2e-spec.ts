import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-148: stop-list update', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  it('persists the stop-list flag and exposes it in the refreshed guest menu', async () => {
    await request(fixture.app.getHttpServer())
      .get('/api/v1/guest/menu').set('X-QR-Token', fixture.qrToken)
      .set('Authorization', `Bearer ${fixture.token()}`)
      .expect(200);

    await request(fixture.app.getHttpServer())
      .patch(`/api/v1/admin/menu/items/${fixture.itemId}/stop-list`)
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ isInStopList: true })
      .expect(200);

    await expect(
      fixture.prisma.menuItem.findUnique({
        where: {
          tenantId_id: { tenantId: fixture.tenantId, id: fixture.itemId },
        },
        select: { isInStopList: true },
      }),
    ).resolves.toEqual({ isInStopList: true });

    const guestMenu = (await request(fixture.app.getHttpServer())
      .get('/api/v1/guest/menu').set('X-QR-Token', fixture.qrToken)
      .set('Authorization', `Bearer ${fixture.token()}`)
      .expect(200)) as unknown as { body: unknown };

    expect(hasStopListedItem(guestMenu.body, fixture.itemId)).toBe(true);
  });
});

function hasStopListedItem(menu: unknown, itemId: string): boolean {
  if (!Array.isArray(menu)) return false;

  return menu.some((category) => {
    if (!isRecord(category) || !Array.isArray(category.items)) return false;
    return category.items.some(
      (item) => isRecord(item) && item.id === itemId && item.isInStopList === true,
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
