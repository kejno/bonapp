import request from 'supertest';
import { MenuGateway } from '../src/menu/menu.gateway';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-364: изменение стоп-листа блюда', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  it('сохраняет состояние в базе и показывает его в обновлённом гостевом меню', async () => {
    const authorization = { Authorization: `Bearer ${fixture.token()}` };
    const emitStopListChanged = jest.spyOn(fixture.app.get(MenuGateway), 'emitStopListChanged');
    await request(fixture.app.getHttpServer())
      .patch(`/api/v1/admin/menu/items/${fixture.itemId}/stop-list`)
      .set(authorization)
      .send({ isInStopList: true })
      .expect(200);
    expect(emitStopListChanged).toHaveBeenCalledWith(fixture.tenantId, fixture.itemId, true);

    await expect(fixture.prisma.menuItem.findUnique({
      where: { tenantId_id: { tenantId: fixture.tenantId, id: fixture.itemId } },
      select: { isInStopList: true },
    })).resolves.toEqual({ isInStopList: true });

    const guestMenu = (await request(fixture.app.getHttpServer())
      .get(`/api/v1/guest/menu?tenantId=${fixture.tenantId}`)
      .set(authorization)
      .expect(200)) as unknown as { body: Array<{ items: Array<{ id: string; isInStopList: boolean }> }> };
    expect(guestMenu.body.some((category) =>
      category.items.some((item) => item.id === fixture.itemId && item.isInStopList),
    )).toBe(true);
  });
});
