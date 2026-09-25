import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-391: порядок блюд в категории', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  it('сохраняет новый порядок через API и возвращает его при повторной загрузке каталога', async () => {
    const secondItemId = `item-second-${fixture.itemId}`;
    const thirdItemId = `item-third-${fixture.itemId}`;
    await fixture.prisma.menuItem.create({
      data: {
        id: secondItemId,
        tenantId: fixture.tenantId,
        categoryId: fixture.categoryId,
        name: 'Americano',
        priceByn: '4.00',
        sortOrder: 1,
      },
    });
    await fixture.prisma.menuItem.create({
      data: {
        id: thirdItemId,
        tenantId: fixture.tenantId,
        categoryId: fixture.categoryId,
        name: 'Latte',
        priceByn: '5.00',
        sortOrder: 2,
      },
    });
    const authorization = { Authorization: `Bearer ${fixture.token()}` };

    await request(fixture.app.getHttpServer())
      .patch('/api/v1/admin/menu/items/reorder')
      .set(authorization)
      .send({ categoryId: fixture.categoryId, itemIds: [thirdItemId, fixture.itemId, secondItemId] })
      .expect(200);

    const refreshed = (await request(fixture.app.getHttpServer())
      .get('/api/v1/admin/menu/items')
      .set(authorization)
      .expect(200)) as unknown as { body: Array<{ id: string }> };
    expect(refreshed.body.map((item) => item.id)).toEqual([thirdItemId, fixture.itemId, secondItemId]);
    await expect(fixture.prisma.menuItem.findMany({
      where: { tenantId: fixture.tenantId, categoryId: fixture.categoryId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    })).resolves.toEqual([{ id: thirdItemId }, { id: fixture.itemId }, { id: secondItemId }]);
  });
});
