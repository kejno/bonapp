import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-541 analytics waiter tips (e2e)', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('groups current-shift and period tips by waiter and excludes payments outside the period', async () => {
    const area = await fixture.prisma.diningArea.create({
      data: { tenantId: fixture.tenantId, name: 'Analytics hall' },
    });
    const table = await fixture.prisma.table.create({
      data: { tenantId: fixture.tenantId, areaId: area.id, tableNumber: 1, qrToken: 'bnp541-qr' },
    });
    const anna = await fixture.createStaff('WAITER');
    const ivan = await fixture.createStaff('WAITER');
    await fixture.prisma.user.update({ where: { id: anna.id }, data: { fullName: 'Анна' } });
    await fixture.prisma.user.update({ where: { id: ivan.id }, data: { fullName: 'Иван' } });

    const now = new Date();
    const createPayment = async (args: {
      orderNumber: number;
      waiterId: string;
      tips: string;
      createdAt: Date;
      status?: 'COMPLETED' | 'PENDING';
    }) => {
      const order = await fixture.prisma.order.create({
        data: {
          tenantId: fixture.tenantId, tableId: table.id, dailyOrderNumber: args.orderNumber,
          assignedWaiterId: args.waiterId, status: 'PAID', totalAmountByn: '20.00', isPaid: true,
          paidAt: args.createdAt,
        },
      });
      await fixture.prisma.payment.create({
        data: {
          tenantId: fixture.tenantId, orderId: order.id, amountByn: '20.00',
          tipsAmountByn: args.tips, provider: 'test', status: args.status ?? 'COMPLETED', createdAt: args.createdAt,
        },
      });
    };

    await createPayment({ orderNumber: 1, waiterId: anna.id, tips: '3.00', createdAt: new Date(now.getTime() - 30 * 60 * 1000) });
    await createPayment({ orderNumber: 6, waiterId: anna.id, tips: '0.00', createdAt: new Date(now.getTime() - 28 * 60 * 1000) });
    await createPayment({ orderNumber: 2, waiterId: ivan.id, tips: '2.00', createdAt: new Date(now.getTime() - 25 * 60 * 1000) });
    await createPayment({ orderNumber: 3, waiterId: anna.id, tips: '5.00', createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000) });
    await createPayment({ orderNumber: 4, waiterId: ivan.id, tips: '100.00', createdAt: new Date(now.getTime() - 72 * 60 * 60 * 1000) });
    await createPayment({ orderNumber: 5, waiterId: anna.id, tips: '50.00', createdAt: now, status: 'PENDING' });

    const activeShift = await fixture.adminRequest().get('/api/v1/admin/analytics/tips').expect(200);
    const from = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const to = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const period = await fixture.adminRequest()
      .get(`/api/v1/admin/analytics/tips?from=${from}&to=${to}`)
      .expect(200);

    expect(activeShift.body).toEqual([
      { waiterName: 'Анна', tipsByn: 3, transactionsCount: 1 },
      { waiterName: 'Иван', tipsByn: 2, transactionsCount: 1 },
    ]);
    expect(period.body).toEqual([
      { waiterName: 'Анна', tipsByn: 8, transactionsCount: 2 },
      { waiterName: 'Иван', tipsByn: 2, transactionsCount: 1 },
    ]);
  });
});
