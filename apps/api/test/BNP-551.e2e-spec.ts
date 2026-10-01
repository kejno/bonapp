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

  it('counts monthly revenue only for active paid tenants and reports daily totals', async () => {
    await fixture.prisma.tenant.update({
      where: { id: fixture.tenantId },
      data: { plan: 'PRO', subscriptionPlan: 'PRO', status: 'ACTIVE', isActive: true },
    });
    await fixture.prisma.tenant.createMany({
      data: [
        { id: 'bnp551-paid', slug: 'bnp551-paid', name: 'BNP-551 Paid', plan: 'STARTER', subscriptionPlan: 'STARTER', status: 'ACTIVE', isActive: true },
        { id: 'bnp551-free', slug: 'bnp551-free', name: 'BNP-551 Free', plan: 'TRIAL', status: 'ACTIVE', isActive: true },
        { id: 'bnp551-inactive', slug: 'bnp551-inactive', name: 'BNP-551 Inactive', plan: 'ENTERPRISE', subscriptionPlan: 'ENTERPRISE', status: 'BLOCKED', isActive: false },
      ],
    });

    const area = await fixture.prisma.diningArea.create({
      data: { tenantId: fixture.tenantId, name: 'BNP-551 QR area' },
    });
    const table = await fixture.prisma.table.create({
      data: { tenantId: fixture.tenantId, areaId: area.id, tableNumber: 551, qrToken: 'bnp551-qr-token' },
    });
    const order = await fixture.prisma.order.create({
      data: {
        tenantId: fixture.tenantId,
        tableId: table.id,
        dailyOrderNumber: 1,
        guestSessionId: 'bnp551-guest-session',
        createdAt: new Date(),
      },
    });

    await fixture.prisma.payment.create({
      data: { tenantId: fixture.tenantId, orderId: order.id, amountByn: '120.00', provider: 'test', method: 'BANK_CARD', type: 'SUBSCRIPTION', status: 'COMPLETED' },
    });
    const paidArea = await fixture.prisma.diningArea.create({
      data: { tenantId: 'bnp551-paid', name: 'BNP-551 paid area' },
    });
    const paidTable = await fixture.prisma.table.create({
      data: { tenantId: 'bnp551-paid', areaId: paidArea.id, tableNumber: 552, qrToken: 'bnp551-paid-qr-token' },
    });
    const paidOrder = await fixture.prisma.order.create({
      data: { tenantId: 'bnp551-paid', tableId: paidTable.id, dailyOrderNumber: 552 },
    });
    await fixture.prisma.payment.create({
      data: { tenantId: 'bnp551-paid', orderId: paidOrder.id, amountByn: '55.00', provider: 'test', method: 'BANK_CARD', type: 'SUBSCRIPTION', status: 'SUCCEEDED' },
    });
    const inactiveArea = await fixture.prisma.diningArea.create({
      data: { tenantId: 'bnp551-inactive', name: 'BNP-551 inactive area' },
    });
    const inactiveTable = await fixture.prisma.table.create({
      data: { tenantId: 'bnp551-inactive', areaId: inactiveArea.id, tableNumber: 553, qrToken: 'bnp551-inactive-qr-token' },
    });
    const inactiveOrder = await fixture.prisma.order.create({
      data: { tenantId: 'bnp551-inactive', tableId: inactiveTable.id, dailyOrderNumber: 553 },
    });
    await fixture.prisma.payment.create({
      data: { tenantId: 'bnp551-inactive', orderId: inactiveOrder.id, amountByn: '500.00', provider: 'test', method: 'BANK_CARD', type: 'SUBSCRIPTION', status: 'COMPLETED' },
    });

    const stats = await fixture.adminRequest()
      .get('/api/v1/superadmin/platform/stats')
      .set('Authorization', authorization)
      .expect(200);
    expect(stats.body).toEqual({ mrr_byn: 175, total_tenants: 4, active_tenants: 3, qr_orders_today: 1 });
  });
});
