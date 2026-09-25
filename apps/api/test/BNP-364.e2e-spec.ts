import request from 'supertest';
import { MenuGateway } from '../src/menu/menu.gateway';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-364: update item stop-list state', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  it('updates the database and guest menu and emits the tenant event', async () => {
    const gateway = fixture.app.get(MenuGateway);
    const emitStopListChanged = jest.spyOn(gateway, 'emitStopListChanged');
    const authorization = { Authorization: `Bearer ${fixture.token()}` };

    await request(fixture.app.getHttpServer())
      .get(`/api/v1/guest/menu?tenantId=${fixture.tenantId}`)
      .set(authorization)
      .expect(200);

    await request(fixture.app.getHttpServer())
      .patch(`/api/v1/admin/menu/items/${fixture.itemId}/stop-list`)
      .set(authorization)
      .send({ isInStopList: true })
      .expect(200);

    await expect(
      fixture.prisma.menuItem.findUnique({
        where: { tenantId_id: { tenantId: fixture.tenantId, id: fixture.itemId } },
        select: { isInStopList: true },
      }),
    ).resolves.toEqual({ isInStopList: true });

    const guestMenu = await request(fixture.app.getHttpServer())
      .get(`/api/v1/guest/menu?tenantId=${fixture.tenantId}`)
      .set(authorization)
      .expect(200);
    expect(hasStopListedItem(guestMenu.body, fixture.itemId)).toBe(true);
    expect(emitStopListChanged).toHaveBeenCalledWith(fixture.tenantId, fixture.itemId, true);
  });
});

function hasStopListedItem(menu: unknown, itemId: string): boolean {
  if (!Array.isArray(menu)) return false;
  const categories: unknown[] = menu;
  return categories.some((category: unknown) => {
    if (!isRecord(category) || !Array.isArray(category.items)) return false;
    const items: unknown[] = category.items;
    return items.some(
      (item: unknown) =>
        isRecord(item) && item.id === itemId && item.isInStopList === true,
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
