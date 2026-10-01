import { loginRequest } from './auth-test.fixture';
import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-452: открытие смены из welcome', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => {
    await fixture.start();
    await fixture.prisma.user.update({ where: { id: fixture.userId }, data: { role: 'MANAGER' } });
    const response = await loginRequest(fixture.app.getHttpServer()).send({
      tenantId: fixture.tenantId,
      email: fixture.userEmail,
      password: fixture.userPassword,
    }).expect(200);
    fixture.authorization = `Bearer ${(response.body as { accessToken: string }).accessToken}`;
  }, 120_000);
  afterAll(async () => fixture.stop());

  it('не открывает смену через welcome без успешного подтверждения СКНО', async () => {
    await fixture.adminRequest()
      .post('/api/v1/admin/welcome/shifts/open')
      .expect(400);

    await fixture.adminRequest()
      .get('/api/v1/admin/shifts/current')
      .expect(200)
      .expect(({ text }) => expect(text).toBe(''));
  });
});
