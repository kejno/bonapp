import { hash } from 'bcryptjs';
import { StaffTestFixture } from './staff-test.fixture';
import { loginRequest } from './auth-test.fixture';

describe('BNP-409: права роли сотрудника', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('сохраняет роль сотрудника и ограничивает доступ к операциям смены', async () => {
    const waiter = await fixture.createStaff('WAITER');
    const update = await fixture.adminRequest()
      .put(`/api/v1/admin/staff/${waiter.id}`)
      .send({ full_name: waiter.fullName, email: waiter.email, role: 'WAITER' })
      .expect(200);
    expect(update.body).toMatchObject({ id: waiter.id, role: 'WAITER' });

    const token = await fixture.prisma.user.findUniqueOrThrow({ where: { id: waiter.id } });
    expect(token.role).toBe('WAITER');

    const password = 'WaiterPass123';
    await fixture.prisma.user.update({
      where: { id: waiter.id },
      data: { passwordHash: await hash(password, 4) },
    });
    const login = await loginRequest(fixture.app.getHttpServer()).send({
      tenantId: fixture.tenantId,
      email: waiter.email,
      password,
    }).expect(200);
    const authorization = `Bearer ${(login.body as { accessToken: string }).accessToken}`;

    await fixture.adminRequest().set('Authorization', authorization).post('/api/v1/admin/shifts/open')
      .send({ cashier_id: waiter.id }).expect(403);
  });
});
