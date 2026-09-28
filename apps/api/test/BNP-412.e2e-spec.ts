import { compare, hash } from 'bcryptjs';
import request from 'supertest';
import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-412: сброс PIN-кода', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('сохраняет выданный новый PIN и не раскрывает PIN-хэш в списке сотрудников', async () => {
    const staff = await fixture.createStaff('WAITER');
    const oldPin = '1234';
    await fixture.prisma.user.update({
      where: { id: staff.id },
      data: { pinHash: await hash(oldPin, 4) },
    });
    const resetResponse = await fixture.adminRequest().patch(`/api/v1/admin/staff/${staff.id}/reset-pin`).expect(200);
    const response = resetResponse.body as { new_pin: string; pinHash?: string };
    expect(response.new_pin).toMatch(/^\d{4}$/);
    expect(response).not.toHaveProperty('pinHash');
    const stored = await fixture.prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
    expect(stored.pinHash).toBeTruthy();
    await expect(compare(response.new_pin, stored.pinHash!)).resolves.toBe(true);

    await request(fixture.app.getHttpServer())
      .post('/api/v1/auth/pin-login')
      .send({ tenantSlug: fixture.tenantId, pin: response.new_pin })
      .expect(201);
    await request(fixture.app.getHttpServer())
      .post('/api/v1/auth/pin-login')
      .send({ tenantSlug: fixture.tenantId, pin: oldPin })
      .expect(401);

    const list = await fixture.adminRequest().get('/api/v1/admin/staff').expect(200);
    expect(JSON.stringify(list.body)).not.toContain(stored.pinHash);
  });
});
