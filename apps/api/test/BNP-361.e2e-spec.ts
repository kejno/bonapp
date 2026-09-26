import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

type TableResponse = { tableNumber: number; qrToken: string };

describe('BNP-361: массовое создание столов', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  it('создаёт 10 столов с уникальными QR-токенами, сохранёнными в БД', async () => {
    const area = await fixture.prisma.diningArea.create({
      data: { tenantId: fixture.tenantId, name: 'Основной зал' },
    });
    const response = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/tables/bulk')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ areaId: area.id, startNumber: 101, count: 10, seatsCount: 4 })
      .expect(201);

    const tables = response.body as TableResponse[];
    expect(tables).toHaveLength(10);
    expect(tables.map((table) => table.tableNumber)).toEqual(
      Array.from({ length: 10 }, (_, index) => 101 + index),
    );
    const tokens = tables.map((table) => table.qrToken);
    expect(tokens.every((token) => token.length > 0)).toBe(true);
    expect(new Set(tokens).size).toBe(10);

    const persisted = await fixture.prisma.table.findMany({
      where: { tenantId: fixture.tenantId, tableNumber: { gte: 101, lte: 110 } },
      orderBy: { tableNumber: 'asc' },
    });
    expect(persisted).toHaveLength(10);
    expect(persisted.map((table) => table.qrToken)).toEqual(tokens);
  });
});
