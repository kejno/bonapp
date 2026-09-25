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

  it('обновляет статус через API и сохраняет его в базе данных', async () => {
    const area = await fixture.prisma.diningArea.create({
      data: { tenantId: fixture.tenantId, name: 'Основной зал' },
    });
    const table = await fixture.prisma.table.create({
      data: {
        tenantId: fixture.tenantId,
        areaId: area.id,
        tableNumber: 41,
        qrToken: `bnp362-${fixture.tenantId}`,
      },
    });

    const response = await request(fixture.app.getHttpServer())
      .patch(`/api/v1/admin/tables/${table.id}/status`)
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ status: TableStatus.BILL_REQUESTED })
      .expect(200);

    expect(response.body).toMatchObject({ id: table.id, status: TableStatus.BILL_REQUESTED });
    await expect(
      fixture.prisma.table.findUniqueOrThrow({ where: { id: table.id } }),
    ).resolves.toMatchObject({ status: TableStatus.BILL_REQUESTED });
  });
});
