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

  it('создаёт пять столов с уникальными QR-токенами и формирует для них PDF', async () => {
    const area = await fixture.prisma.diningArea.create({
      data: { tenantId: fixture.tenantId, name: 'Основной зал' },
    });
    const response = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/tables/bulk')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ areaId: area.id, startNumber: 101, count: 5, seatsCount: 4 })
      .expect(201);

    const tables = response.body as TableResponse[];
    expect(tables).toHaveLength(5);
    expect(tables.map((table) => table.tableNumber)).toEqual(
      Array.from({ length: 5 }, (_, index) => 101 + index),
    );
    const tokens = tables.map((table) => table.qrToken);
    expect(tokens.every((token) => token.length > 0)).toBe(true);
    expect(new Set(tokens).size).toBe(5);

    const persisted = await fixture.prisma.table.findMany({
      where: { tenantId: fixture.tenantId, tableNumber: { gte: 101, lte: 105 } },
      orderBy: { tableNumber: 'asc' },
    });
    expect(persisted).toHaveLength(5);
    expect(persisted.map((table) => table.qrToken)).toEqual(tokens);

    const pdfResponse = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/tables/generate-qr-pdf')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ tableIds: tables.map((table) => table.id) })
      .expect(200)
      .expect('Content-Type', /application\/pdf/);

    const pdf = pdfResponse.body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
