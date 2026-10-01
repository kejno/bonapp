import { StaffTestFixture } from './staff-test.fixture';
import { loginRequest } from './auth-test.fixture';

describe('BNP-550 SuperAdmin tenant management (e2e)', () => {
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

  it('lists tenant fields and persists plan, trial extension, and deactivation', async () => {
    const trialEndsAt = '2026-12-31T00:00:00.000Z';
    const listed = await fixture.adminRequest().get('/api/v1/superadmin/tenants').expect(200);
    const tenants = listed.body as unknown as Array<Record<string, unknown>>;
    const listedTenant = tenants.find((tenant) => tenant['id'] === fixture.tenantId);
    expect(listedTenant).toBeDefined();
    expect(listedTenant).toMatchObject({
      name: 'Auth E2E Tenant',
      slug: fixture.tenantId,
      plan: 'TRIAL',
      is_active: true,
      trial_ends_at: null,
    });
    expect(typeof listedTenant?.['order_count_30d']).toBe('number');
    expect(typeof listedTenant?.['monthly_revenue_byn']).toBe('number');

    const updated = await fixture.adminRequest()
      .patch(`/api/v1/superadmin/tenants/${fixture.tenantId}`)
      .set('Authorization', authorization)
      .send({ subscription_plan: 'PRO', trial_ends_at: trialEndsAt, is_active: false })
      .expect(200);
    const updatedTenant = updated.body as unknown as { subscriptionPlan: string; isActive: boolean; trialEndsAt: string };
    expect(updatedTenant).toMatchObject({ subscriptionPlan: 'PRO', isActive: false });
    expect(new Date(updatedTenant.trialEndsAt).toISOString()).toBe(trialEndsAt);

    const persisted = await fixture.prisma.tenant.findUniqueOrThrow({ where: { id: fixture.tenantId } });
    expect(persisted.subscriptionPlan).toBe('PRO');
    expect(persisted.isActive).toBe(false);
    expect(persisted.trialEndsAt?.toISOString()).toBe(trialEndsAt);
  });
});
