import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

type TableResponse = { id: string; qrToken: string };

describe('BNP-360: создание, изменение и удаление стола', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  it('создаёт стол с уникальным QR-токеном, сохраняет изменения и удаляет его', async () => {
    const area = await fixture.prisma.diningArea.create({
      data: { tenantId: fixture.tenantId, name: 'Основной зал' },
    });
    const createdResponse = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/tables')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ tableNumber: 31, label: 'У окна', seatsCount: 4, areaId: area.id })
      .expect(201);
    const created = createdResponse.body as TableResponse;

    expect(created.qrToken).toEqual(expect.any(String));
    expect(created.qrToken.length).toBeGreaterThan(0);
    const secondResponse = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/tables')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ tableNumber: 33, label: 'У стены', seatsCount: 4, areaId: area.id })
      .expect(201);
    expect((secondResponse.body as TableResponse).qrToken).not.toBe(created.qrToken);
    const persisted = await fixture.prisma.table.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(persisted.qrToken).toBe(created.qrToken);

    await request(fixture.app.getHttpServer())
      .put(`/api/v1/admin/tables/${created.id}`)
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ tableNumber: 32, label: 'У окна справа', seatsCount: 2 })
      .expect(200);
    await expect(
      fixture.prisma.table.findUniqueOrThrow({ where: { id: created.id } }),
    ).resolves.toMatchObject({
      tableNumber: 32,
      label: 'У окна справа',
      seatsCount: 2,
      qrToken: created.qrToken,
    });

    await request(fixture.app.getHttpServer())
      .delete(`/api/v1/admin/tables/${created.id}`)
      .set('Authorization', `Bearer ${fixture.token()}`)
      .expect(204);
    await expect(
      fixture.prisma.table.findUnique({ where: { id: created.id } }),
    ).resolves.toBeNull();
  });
});
