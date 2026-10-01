import { StaffTestFixture } from './staff-test.fixture';
import { loginRequest } from './auth-test.fixture';

describe('BNP-550 SuperAdmin tenant management (e2e)', () => {
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

  it('reads tenant fields and persists plan, trial extension, and blocking through current routes', async () => {
    const trialEndsAt = new Date(Date.now() + 10 * 86400000);
    await fixture.prisma.tenant.update({ where: { id: fixture.tenantId }, data: { trialEndsAt } });

    const overview = await fixture.adminRequest().get('/api/v1/superadmin/overview').expect(200);
    const body = overview.body as unknown as { tenants: Array<Record<string, unknown>> };
    const tenant = body.tenants.find((item) => item['id'] === fixture.tenantId);
    expect(tenant).toMatchObject({
      name: 'Auth E2E Tenant',
      plan: 'TRIAL',
      status: 'TRIAL',
      isActive: true,
      revenue30dByn: 0,
    });
    expect(new Date(String(tenant?.['trialEndsAt'])).toISOString()).toBe(trialEndsAt.toISOString());

    const changedPlan = await fixture.adminRequest()
      .patch(`/api/v1/superadmin/tenants/${fixture.tenantId}/plan`)
      .send({ plan: 'PRO' })
      .expect(200);
    expect(changedPlan.body).toMatchObject({ id: fixture.tenantId, plan: 'PRO' });
    expect((await fixture.prisma.tenant.findUniqueOrThrow({ where: { id: fixture.tenantId } })).subscriptionPlan).toBe('PRO');

    const extended = await fixture.adminRequest()
      .patch(`/api/v1/superadmin/tenants/${fixture.tenantId}/trial`)
      .send({ extend_days: 30 })
      .expect(200);
    const extendedDate = new Date(String((extended.body as Record<string, unknown>)['trialEndsAt']));
    expect(extendedDate.toISOString()).toBe(new Date(trialEndsAt.getTime() + 30 * 86400000).toISOString());

    const blocked = await fixture.adminRequest()
      .patch(`/api/v1/superadmin/tenants/${fixture.tenantId}/block`)
      .send({ blocked: true })
      .expect(200);
    expect(blocked.body).toMatchObject({ id: fixture.tenantId, status: 'BLOCKED' });
    const persisted = await fixture.prisma.tenant.findUniqueOrThrow({ where: { id: fixture.tenantId } });
    expect(persisted.plan).toBe('PRO');
    expect(persisted.status).toBe('BLOCKED');
    expect(persisted.isActive).toBe(false);
    expect(persisted.trialEndsAt?.toISOString()).toBe(extendedDate.toISOString());
  });

  it('lists tenants and updates plan, trial end, and activity through the documented contract', async () => {
    const trialEndsAt = new Date(Date.now() + 10 * 86400000);
    await fixture.prisma.tenant.update({
      where: { id: fixture.tenantId },
      data: { status: 'ACTIVE', statusBeforeBlock: null, isActive: true, isActiveBeforeBlock: null },
    });
    const tenants = await fixture.adminRequest().get('/api/v1/superadmin/tenants').expect(200);
    expect(Array.isArray(tenants.body)).toBe(true);
    const tenant = (tenants.body as Array<Record<string, unknown>>).find((item) => item['id'] === fixture.tenantId);
    expect(tenant?.['name']).toBe('Auth E2E Tenant');
    expect(typeof tenant?.['slug']).toBe('string');
    expect(typeof tenant?.['plan']).toBe('string');
    expect(tenant?.['is_active']).toBe(true);
    expect(typeof tenant?.['order_count_30d']).toBe('number');
    expect(typeof tenant?.['monthly_revenue_byn']).toBe('number');
    expect(tenant?.['trial_ends_at']).toBeDefined();

    await fixture.adminRequest()
      .patch(`/api/v1/superadmin/tenants/${fixture.tenantId}`)
      .send({ subscription_plan: 'PRO' })
      .expect(200);
    await fixture.adminRequest()
      .patch(`/api/v1/superadmin/tenants/${fixture.tenantId}`)
      .send({ trial_ends_at: trialEndsAt.toISOString() })
      .expect(200);
    await fixture.adminRequest()
      .patch(`/api/v1/superadmin/tenants/${fixture.tenantId}`)
      .send({ is_active: false })
      .expect(200);

    const updatedTenants = await fixture.adminRequest().get('/api/v1/superadmin/tenants').expect(200);
    const updated = (updatedTenants.body as Array<Record<string, unknown>>).find((item) => item['id'] === fixture.tenantId);
    expect(updated).toMatchObject({ plan: 'PRO', is_active: false });
    const persisted = await fixture.prisma.tenant.findUniqueOrThrow({ where: { id: fixture.tenantId } });
    expect(persisted.status).toBe('BLOCKED');
    expect(persisted.isActive).toBe(false);
    expect(new Date(String(updated?.['trial_ends_at'])).toISOString()).toBe(trialEndsAt.toISOString());
  });
});
