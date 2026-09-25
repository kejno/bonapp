import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-147: menu catalog CRUD', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  it('creates a category and item, updates the item, and cascades all item dependencies on category deletion', async () => {
    const authorization = { Authorization: `Bearer ${fixture.token()}` };
    const category = (await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/menu/categories')
      .set(authorization)
      .send({ name: 'Desserts', sortOrder: 1, isVisible: true })
      .expect(201)) as unknown as { body: { id: string } };

    const item = (await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/menu/items')
      .set(authorization)
      .send({ name: 'Cheesecake', categoryId: category.body.id, price: 990 })
      .expect(201)) as unknown as { body: { id: string } };

    await request(fixture.app.getHttpServer())
      .put(`/api/v1/admin/menu/items/${item.body.id}`)
      .set(authorization)
      .send({ name: 'Berry cheesecake', price: 1090 })
      .expect(200);

    const modifierGroupId = randomUUID();
    const modifierId = randomUUID();
    const modifierOptionId = randomUUID();
    await fixture.prisma.stopListItem.create({
      data: { tenantId: fixture.tenantId, menuItemId: item.body.id },
    });
    await fixture.prisma.modifierGroup.create({
      data: {
        id: modifierGroupId,
        tenantId: fixture.tenantId,
        itemId: item.body.id,
        name: 'Toppings',
      },
    });
    await fixture.prisma.modifier.create({
      data: {
        id: modifierId,
        tenantId: fixture.tenantId,
        modifierGroupId,
        name: 'Chocolate',
        price: '1.00',
      },
    });
    await fixture.prisma.modifierOption.create({
      data: { id: modifierOptionId, groupId: modifierGroupId, name: 'Extra berry' },
    });
    await fixture.prisma.menuItemModifierGroup.create({
      data: { tenantId: fixture.tenantId, menuItemId: item.body.id, modifierGroupId },
    });

    await fixture.redis.set(fixture.cacheKey, 'stale-menu');
    await request(fixture.app.getHttpServer())
      .delete(`/api/v1/admin/menu/categories/${category.body.id}`)
      .set(authorization)
      .expect(200);

    await expect(
      fixture.prisma.menuItem.findUnique({ where: { id: item.body.id } }),
    ).resolves.toBeNull();
    await expect(
      fixture.prisma.stopListItem.findUnique({
        where: { tenantId_menuItemId: { tenantId: fixture.tenantId, menuItemId: item.body.id } },
      }),
    ).resolves.toBeNull();
    await expect(
      fixture.prisma.modifierGroup.findUnique({ where: { id: modifierGroupId } }),
    ).resolves.toBeNull();
    await expect(
      fixture.prisma.modifier.findUnique({ where: { id: modifierId } }),
    ).resolves.toBeNull();
    await expect(
      fixture.prisma.modifierOption.findUnique({ where: { id: modifierOptionId } }),
    ).resolves.toBeNull();
    await expect(
      fixture.prisma.menuItemModifierGroup.findUnique({
        where: { menuItemId_modifierGroupId: { menuItemId: item.body.id, modifierGroupId } },
      }),
    ).resolves.toBeNull();
    await expect(fixture.redis.get(fixture.cacheKey)).resolves.toBeNull();
  });

  it('rejects a waiter and permits a manager to administer the menu', async () => {
    const waiterAuthorization = {
      Authorization: `Bearer ${fixture.token('WAITER')}`,
    };
    const managerAuthorization = {
      Authorization: `Bearer ${fixture.token('MANAGER')}`,
    };

    await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/menu/categories')
      .set(waiterAuthorization)
      .send({ name: 'Forbidden', sortOrder: 1, isVisible: true })
      .expect(403);

    await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/menu/categories')
      .set(managerAuthorization)
      .send({ name: 'Manager category', sortOrder: 2, isVisible: true })
      .expect(201);

    await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/media/presign')
      .set(waiterAuthorization)
      .send({ contentType: 'image/jpeg' })
      .expect(403);
  });
});
