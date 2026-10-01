import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-547 analytics Z-report (e2e)', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('returns the latest closed shift totals, payment split, and refunds', async () => {
    const cashier = await fixture.createStaff('CASHIER');
    const openedAt = new Date(Date.now() - 60 * 60 * 1000);
    const closedAt = new Date();
    const shift = await fixture.prisma.shift.create({
      data: { tenantId: fixture.tenantId, cashierId: cashier.id, status: 'CLOSED', openedAt, closedAt },
    });
    await fixture.prisma.shiftReport.create({
      data: {
        tenantId: fixture.tenantId, shiftId: shift.id, cashierId: cashier.id,
        openedAt, closedAt, totalAmount: '30.00', orderCount: 2, zReportNumber: 42,
      },
    });
    const area = await fixture.prisma.diningArea.create({
      data: { tenantId: fixture.tenantId, name: 'Z report hall' },
    });
    const table = await fixture.prisma.table.create({
      data: { tenantId: fixture.tenantId, areaId: area.id, tableNumber: 1, qrToken: 'bnp547-qr' },
    });
    const order = await fixture.prisma.order.create({
      data: {
        tenantId: fixture.tenantId, tableId: table.id, dailyOrderNumber: 1,
        status: 'PAID', totalAmountByn: '30.00', isPaid: true, paidAt: closedAt,
      },
    });
    await fixture.prisma.payment.createMany({
      data: [
        { tenantId: fixture.tenantId, orderId: order.id, amountByn: '30.00', provider: 'test', method: 'BANK_CARD', status: 'COMPLETED', createdAt: closedAt },
        { tenantId: fixture.tenantId, orderId: order.id, amountByn: '5.00', provider: 'test', method: 'BANK_CARD', status: 'REFUNDED', createdAt: closedAt },
      ],
    });

    const response = await fixture.adminRequest().get('/api/v1/admin/analytics/shift-report').expect(200);

    expect(response.body).toMatchObject({
      id: shift.id, zReportNumber: 42, ordersCount: 1, revenueByn: 30, refundsByn: 5,
      payments: [
        { method: 'OPLATI_QR', amountByn: 0, transactionsCount: 0 },
        { method: 'ERIP_EPOS', amountByn: 0, transactionsCount: 0 },
        { method: 'BANK_CARD', amountByn: 30, transactionsCount: 1 },
        { method: 'CASH_TO_WAITER', amountByn: 0, transactionsCount: 0 },
      ],
    });
  });
});
