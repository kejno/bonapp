import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-363: manage modifier groups and options', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  it('creates, updates, and deactivates a group and its option through the API', async () => {
    const auth = { Authorization: `Bearer ${fixture.token()}` };
    const groupResponse = await request(fixture.app.getHttpServer())
      .post(`/api/v1/admin/menu/items/${fixture.itemId}/modifier-groups`)
      .set(auth)
      .send({ name: 'Размер', minSelected: 1, maxSelected: 2 })
      .expect(201);
    const group = groupResponse.body as { id: string; name: string };
    const groupId = group.id;
    expect(group.name).toBe('Размер');

    const optionResponse = await request(fixture.app.getHttpServer())
      .post(`/api/v1/admin/menu/modifier-groups/${groupId}/options`)
      .set(auth)
      .send({ name: 'Большой', extraPriceByn: 1.5, isDefault: true })
      .expect(201);
    const option = optionResponse.body as { id: string };
    const optionId = option.id;
    expect(optionResponse.body).toMatchObject({
      name: 'Большой',
      extraPriceByn: '1.5',
      isDefault: true,
    });

    await request(fixture.app.getHttpServer())
      .put(`/api/v1/admin/menu/modifier-groups/${groupId}`)
      .set(auth)
      .send({ name: 'Размер порции' })
      .expect(200);

    const groups = await request(fixture.app.getHttpServer())
      .get(`/api/v1/admin/menu/items/${fixture.itemId}/modifier-groups`)
      .set(auth)
      .expect(200);
    const groupList = groups.body as Array<{
      id: string;
      name: string;
      modifierOptions: Array<{ id: string; name: string; isDefault: boolean }>;
    }>;
    const updatedGroup = groupList.find((group) => group.id === groupId);
    expect(updatedGroup?.name).toBe('Размер порции');
    expect(
      updatedGroup?.modifierOptions.some(
        (modifierOption) =>
          modifierOption.id === optionId &&
          modifierOption.name === 'Большой' &&
          modifierOption.isDefault,
      ),
    ).toBe(true);

    await request(fixture.app.getHttpServer())
      .delete(`/api/v1/admin/menu/modifier-options/${optionId}`)
      .set(auth)
      .expect(200);
    await request(fixture.app.getHttpServer())
      .delete(`/api/v1/admin/menu/modifier-groups/${groupId}`)
      .set(auth)
      .expect(200);

    await expect(
      fixture.prisma.modifierGroup.findUnique({ where: { id: groupId }, select: { isActive: true } }),
    ).resolves.toEqual({ isActive: false });
    await expect(
      fixture.prisma.modifierOption.findUnique({ where: { id: optionId }, select: { isActive: true } }),
    ).resolves.toEqual({ isActive: false });
  });
});
