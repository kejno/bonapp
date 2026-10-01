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

  it('allows SUPER_ADMIN to read the overview, rejects OWNER, and requires authentication', async () => {
    const overview = await fixture.adminRequest().get('/api/v1/superadmin/overview').expect(200);
    const overviewBody = overview.body as unknown as {
      metrics: { activeRestaurants: number; qrOrdersToday: number; subscriptionRevenueByn: number };
      growth: unknown[];
      tenants: Array<{ id: string; name: string }>;
    };
    expect(typeof overviewBody.metrics.activeRestaurants).toBe('number');
    expect(typeof overviewBody.metrics.qrOrdersToday).toBe('number');
    expect(typeof overviewBody.metrics.subscriptionRevenueByn).toBe('number');
    expect(Array.isArray(overviewBody.growth)).toBe(true);
    expect(overviewBody.tenants).toContainEqual({ id: fixture.tenantId, name: 'Auth E2E Tenant' });

    await fixture.prisma.user.update({ where: { id: fixture.userId }, data: { role: 'OWNER' } });
    const ownerLogin = await loginRequest(fixture.app.getHttpServer()).send({
      tenantId: fixture.tenantId,
      email: fixture.userEmail,
      password: fixture.userPassword,
    }).expect(200);
    const ownerBody = ownerLogin.body as unknown as { accessToken: string };
    await fixture.adminRequest()
      .get('/api/v1/superadmin/overview')
      .set('Authorization', `Bearer ${ownerBody.accessToken}`)
      .expect(403);
    await fixture.adminRequest().get('/api/v1/superadmin/overview').set('Authorization', '').expect(401);
  });
});
