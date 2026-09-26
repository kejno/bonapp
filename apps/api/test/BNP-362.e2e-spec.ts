import { TableStatus } from '@prisma/client';
import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-362: изменение статуса стола', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  it('сохраняет допустимые статусы стола через API', async () => {
    const area = await fixture.prisma.diningArea.create({
      data: { tenantId: fixture.tenantId, name: 'Основной зал' },
    });
    const table = await fixture.prisma.table.create({
      data: {
        tenantId: fixture.tenantId,
        areaId: area.id,
        tableNumber: 41,
        qrToken: `bnp362-${fixture.tenantId}`,
        status: TableStatus.AVAILABLE,
      },
    });

    await expect(
      fixture.prisma.table.findUniqueOrThrow({ where: { id: table.id } }),
    ).resolves.toMatchObject({ status: TableStatus.AVAILABLE });

    for (const status of [TableStatus.OCCUPIED, TableStatus.BILL_REQUESTED]) {
      const response = await request(fixture.app.getHttpServer())
        .patch(`/api/v1/admin/tables/${table.id}/status`)
        .set('Authorization', `Bearer ${fixture.token()}`)
        .send({ status })
        .expect(200);

      expect(response.body).toMatchObject({ id: table.id, status });
      await expect(
        fixture.prisma.table.findUniqueOrThrow({ where: { id: table.id } }),
      ).resolves.toMatchObject({ status });
    }
  });
});
