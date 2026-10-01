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

  it('returns overview metrics, monthly growth, and tenant data', async () => {
    await fixture.prisma.tenant.update({
      where: { id: fixture.tenantId },
      data: { plan: 'PRO', subscriptionPlan: 'PRO', status: 'ACTIVE', isActive: true },
    });
    await fixture.prisma.tenant.createMany({
      data: [
        { id: 'bnp551-standard', slug: 'bnp551-standard', name: 'BNP-551 Standard', plan: 'STARTER', subscriptionPlan: 'STARTER', status: 'ACTIVE', isActive: true },
        { id: 'bnp551-trial', slug: 'bnp551-trial', name: 'BNP-551 Trial', plan: 'TRIAL', status: 'TRIAL', isActive: true },
        { id: 'bnp551-inactive', slug: 'bnp551-inactive', name: 'BNP-551 Inactive', plan: 'ENTERPRISE', subscriptionPlan: 'ENTERPRISE', status: 'BLOCKED', isActive: false },
      ],
    });

    const area = await fixture.prisma.diningArea.create({
      data: { tenantId: fixture.tenantId, name: 'BNP-551 QR area' },
    });
    const table = await fixture.prisma.table.create({
      data: { tenantId: fixture.tenantId, areaId: area.id, tableNumber: 551, qrToken: 'bnp551-qr-token' },
    });
    await fixture.prisma.order.create({
      data: {
        tenantId: fixture.tenantId,
        tableId: table.id,
        dailyOrderNumber: 1,
        guestSessionId: 'bnp551-guest-session',
        createdAt: new Date(),
      },
    });

    const overview = await fixture.adminRequest()
      .get('/api/v1/superadmin/overview')
      .set('Authorization', authorization)
      .expect(200);
    const body = overview.body as unknown as {
      metrics: { subscriptionRevenueByn: number; activeRestaurants: number; qrOrdersToday: number };
      growth: Array<{ month: string; subscriptionRevenueByn: number }>;
      tenants: Array<{ id: string; plan: string; status: string; revenue30dByn: number }>;
    };
    expect(body.metrics).toEqual({ subscriptionRevenueByn: 0, activeRestaurants: 2, qrOrdersToday: 1 });
    expect(body.growth).toHaveLength(12);
    expect(body.growth.every((month) => typeof month.month === 'string' && typeof month.subscriptionRevenueByn === 'number')).toBe(true);
    expect(body.tenants).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: fixture.tenantId, plan: 'PRO', status: 'ACTIVE', revenue30dByn: 0 }),
      expect.objectContaining({ id: 'bnp551-trial', plan: 'TRIAL', status: 'TRIAL', revenue30dByn: 0 }),
      expect.objectContaining({ id: 'bnp551-inactive', plan: 'ENTERPRISE', status: 'BLOCKED', revenue30dByn: 0 }),
    ]));
  });
});
