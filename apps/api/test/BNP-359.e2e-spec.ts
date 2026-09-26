import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

type AreaResponse = { id: string; name: string; sortOrder: number; tenantId: string };

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
    const firstResponse = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/areas')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ name: 'Основной зал', sort_order: 10 })
      .expect(201);
    const first = firstResponse.body as AreaResponse;

    const response = await request(fixture.app.getHttpServer())
      .get('/api/v1/admin/areas')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .expect(200);

    const areas = response.body as AreaResponse[];
    expect(areas.map((area) => area.name)).toEqual([
      'Основной зал',
      'Терраса',
    ]);
    expect(areas[0]).toMatchObject({
      id: first.id,
      sortOrder: 10,
      tenantId: fixture.tenantId,
    });
  });
});
