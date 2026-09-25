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

    await request(fixture.app.getHttpServer())
      .get(`/api/v1/guest/menu?tenantId=${fixture.tenantId}`)
      .set('Authorization', `Bearer ${fixture.token()}`)
      .expect(200);

    await request(fixture.app.getHttpServer())
      .patch(`/api/v1/admin/menu/items/${fixture.itemId}/stop-list`)
      .set('Authorization', `Bearer ${fixture.token()}`)
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
      .set('Authorization', `Bearer ${fixture.token()}`)
      .expect(200);
    expect(hasStopListedItem(guestMenu.body, fixture.itemId)).toBe(true);
    expect(emitStopListChanged).toHaveBeenCalledWith(fixture.tenantId, fixture.itemId, true);
  });
});

function hasStopListedItem(menu: unknown, itemId: string): boolean {
  if (!Array.isArray(menu)) return false;
  return menu.some((category) => {
    if (typeof category !== 'object' || category === null || !Array.isArray(category.items)) return false;
    return category.items.some(
      (item: unknown) =>
        typeof item === 'object' && item !== null && 'id' in item && item.id === itemId &&
        'isInStopList' in item && item.isInStopList === true,
    );
  });
}
