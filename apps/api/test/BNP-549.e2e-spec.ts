import { StaffTestFixture } from './staff-test.fixture';
import { loginRequest } from './auth-test.fixture';

describe('BNP-549 SuperAdmin API access (e2e)', () => {
  const fixture = new StaffTestFixture();
  beforeAll(async () => {
    await fixture.start();
    await fixture.prisma.user.update({ where: { id: fixture.userId }, data: { role: 'SUPER_ADMIN' } });
    const response = await loginRequest(fixture.app.getHttpServer()).send({
      tenantId: fixture.tenantId,
      email: fixture.userEmail,
      password: fixture.userPassword,
    }).expect(200);
    const body = response.body as unknown as { accessToken: string };
    fixture.authorization = `Bearer ${body.accessToken}`;
  }, 120_000);
  afterAll(async () => fixture.stop());

  it('allows SUPER_ADMIN, rejects OWNER, and requires authentication', async () => {
    await fixture.adminRequest().get('/api/v1/superadmin/tenants').expect(200);
    await fixture.adminRequest().get('/api/v1/superadmin/platform/stats').expect(200);

    await fixture.prisma.user.update({ where: { id: fixture.userId }, data: { role: 'OWNER' } });
    const ownerLogin = await loginRequest(fixture.app.getHttpServer()).send({
      tenantId: fixture.tenantId,
      email: fixture.userEmail,
      password: fixture.userPassword,
    }).expect(200);
    const ownerBody = ownerLogin.body as unknown as { accessToken: string };
    await fixture.adminRequest()
      .get('/api/v1/superadmin/tenants')
      .set('Authorization', `Bearer ${ownerBody.accessToken}`)
      .expect(403);
    await fixture.adminRequest().get('/api/v1/superadmin/tenants').set('Authorization', '').expect(401);
  });
});
