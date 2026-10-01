import { StaffTestFixture } from './staff-test.fixture';
import { loginRequest } from './auth-test.fixture';

describe('BNP-551 SuperAdmin platform metrics (e2e)', () => {
  const fixture = new StaffTestFixture();
  let authorization = '';

  beforeAll(async () => {
    await fixture.start();
    await fixture.prisma.user.update({ where: { id: fixture.userId }, data: { role: 'SUPER_ADMIN' } });
    const response = await loginRequest(fixture.app.getHttpServer()).send({
      tenantId: fixture.tenantId,
      email: fixture.userEmail,
      password: fixture.userPassword,
    }).expect(200);
    const body = response.body as unknown as { accessToken: string };
    authorization = `Bearer ${body.accessToken}`;
    fixture.authorization = authorization;
  }, 120_000);
  afterAll(async () => fixture.stop());

  it('counts active paid plans in MRR and reports tenant and QR order totals', async () => {
    await fixture.prisma.tenant.update({
      where: { id: fixture.tenantId },
      data: { subscriptionPlan: 'PRO', isActive: true },
    });
    await fixture.prisma.tenant.createMany({
      data: [
        { id: 'bnp551-trial', slug: 'bnp551-trial', name: 'BNP-551 Trial', subscriptionPlan: 'TRIAL', isActive: true },
        { id: 'bnp551-inactive', slug: 'bnp551-inactive', name: 'BNP-551 Inactive', subscriptionPlan: 'ENTERPRISE', isActive: false },
      ],
    });

    const stats = await fixture.adminRequest()
      .get('/api/v1/superadmin/platform/stats')
      .set('Authorization', authorization)
      .expect(200);

    expect(stats.body as unknown as Record<string, number>).toEqual({ mrr_byn: 100, total_tenants: 3, active_tenants: 2, qr_orders_today: 0 });
  });
});
