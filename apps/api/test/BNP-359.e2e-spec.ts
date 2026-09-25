import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-359: создание и сортировка зон обслуживания', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  it('создаёт зоны и возвращает их через API по sortOrder', async () => {
    await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/areas')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ name: 'Терраса', sortOrder: 20 })
      .expect(201);
    const first = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/areas')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ name: 'Основной зал', sortOrder: 10 })
      .expect(201);

    const response = await request(fixture.app.getHttpServer())
      .get('/api/v1/admin/areas')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .expect(200);

    expect(response.body.map((area: { name: string }) => area.name)).toEqual([
      'Основной зал',
      'Терраса',
    ]);
    expect(response.body[0]).toMatchObject({
      id: first.body.id,
      sortOrder: 10,
      tenantId: fixture.tenantId,
    });
  });
});
