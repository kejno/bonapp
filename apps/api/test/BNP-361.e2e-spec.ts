import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

type TableResponse = { id: string; tableNumber: number; qrToken: string };

describe('BNP-361: массовое создание столов и печать QR-кодов', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  it('создаёт десять столов с номерами 1–10 и уникальными QR-токенами', async () => {
    await fixture.prisma.table.deleteMany({
      where: { tenantId: fixture.tenantId, tableNumber: { gte: 1, lte: 10 } },
    });
    const area = await fixture.prisma.diningArea.create({
      data: { tenantId: fixture.tenantId, name: 'Основной зал' },
    });
    const response = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/tables/bulk')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ areaId: area.id, startNumber: 1, count: 10, seatsCount: 4 })
      .expect(201);

    const tables = response.body as TableResponse[];
    expect(tables).toHaveLength(10);
    expect(tables.map((table) => table.tableNumber)).toEqual(
      Array.from({ length: 10 }, (_, index) => index + 1),
    );
    const tokens = tables.map((table) => table.qrToken);
    expect(tokens.every((token) => token.length > 0)).toBe(true);
    expect(new Set(tokens).size).toBe(10);

    const listing = await request(fixture.app.getHttpServer())
      .get('/api/v1/admin/tables')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .expect(200);
    const listedTables = (listing.body as Array<{
      id: string;
      areaId: string;
      tableNumber: number;
      seatsCount: number;
      qrToken: string;
    }>).filter(
      (table) =>
        table.areaId === area.id && table.tableNumber >= 1 && table.tableNumber <= 10,
    );
    expect(listedTables).toHaveLength(10);
    expect(listedTables.map((table) => table.tableNumber)).toEqual(
      Array.from({ length: 10 }, (_, index) => index + 1),
    );
    expect(listedTables.every((table) => table.seatsCount === 4)).toBe(true);
    const listedTokens = listedTables.map((table) => table.qrToken);
    expect(listedTokens.every((token) => token.length > 0)).toBe(true);
    expect(new Set(listedTokens).size).toBe(10);
    expect(listedTokens).toEqual(tokens);
  });
});
