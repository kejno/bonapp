import request from 'supertest';
import { AuthTestFixture, loginRequest } from './auth-test.fixture';

describe('BNP-360: CRUD стола и уникальность QR-токена', () => {
  const fixture = new AuthTestFixture();
  let areaId = '';
  let accessToken = '';

  beforeAll(async () => {
    await fixture.start();
    const area = await fixture.prisma.diningArea.create({ data: { tenantId: fixture.tenantId, name: 'Основной зал' } });
    areaId = area.id;
    const login = await loginRequest(fixture.app.getHttpServer())
      .send({ tenantId: fixture.tenantId, email: fixture.userEmail, password: fixture.userPassword })
      .expect(200);
    accessToken = (login.body as { accessToken: string }).accessToken;
  }, 120_000);
  afterAll(async () => fixture.stop());

  it('создаёт стол с уникальным QR-токеном, сохраняет правки и удаляет запись', async () => {
    const create = (tableNumber: number, label: string) => request(fixture.app.getHttpServer())
      .post('/api/v1/admin/tables').set('Authorization', `Bearer ${accessToken}`)
      .send({ tableNumber, label, seatsCount: 4, areaId });
    const firstResponse = await create(11, 'У окна').expect(201);
    const secondResponse = await create(12, 'У стены').expect(201);
    const first = firstResponse.body as { id: string; qrToken: string };
    const second = secondResponse.body as { id: string; qrToken: string };
    expect(first.qrToken).toBeTruthy();
    expect(second.qrToken).toBeTruthy();
    expect(first.qrToken).not.toBe(second.qrToken);
    expect(await fixture.prisma.table.findUnique({ where: { id: first.id } })).toMatchObject({ label: 'У окна', tableNumber: 11 });

    await request(fixture.app.getHttpServer()).put(`/api/v1/admin/tables/${first.id}`)
      .set('Authorization', `Bearer ${accessToken}`).send({ tableNumber: 13, label: 'У окна справа' }).expect(200);
    expect(await fixture.prisma.table.findUnique({ where: { id: first.id } })).toMatchObject({ tableNumber: 13, label: 'У окна справа' });

    await request(fixture.app.getHttpServer()).delete(`/api/v1/admin/tables/${first.id}`)
      .set('Authorization', `Bearer ${accessToken}`).expect(204);
    expect(await fixture.prisma.table.findUnique({ where: { id: first.id } })).toBeNull();
  });
});
