import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-139: welcome test order simulation', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterAll(async () => fixture.stop());

  it('creates the test order on the lowest numbered table even when another table is older', async () => {
    await fixture.prisma.table.create({
      data: {
        tenantId: fixture.tenantId,
        areaId: (await fixture.prisma.diningArea.findFirstOrThrow({ where: { tenantId: fixture.tenantId } })).id,
        tableNumber: 2,
        qrToken: `older-${fixture.tenantId}`,
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
      },
    });
    const firstNumberedTable = await fixture.prisma.table.findFirstOrThrow({
      where: { tenantId: fixture.tenantId, tableNumber: 1 },
      select: { id: true },
    });

    const response = await request(fixture.app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${fixture.token('OWNER')}`)
      .send({ isTest: true })
      .expect(201);

    expect(response.body).toMatchObject({ tableId: firstNumberedTable.id, isTest: true });
  });
});
