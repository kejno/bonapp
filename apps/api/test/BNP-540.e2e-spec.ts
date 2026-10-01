import { PaymentMethod } from '@prisma/client';
import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-540 analytics revenue and payment split (e2e)', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('aggregates hourly paid revenue and completed transactions by payment method', async () => {
    const area = await fixture.prisma.diningArea.create({
      data: { tenantId: fixture.tenantId, name: 'Analytics hall' },
    });
    const table = await fixture.prisma.table.create({
      data: { tenantId: fixture.tenantId, areaId: area.id, tableNumber: 1, qrToken: 'bnp540-qr' },
    });
    const now = new Date();
    const start = new Date(now.getTime() - 60 * 60 * 1000);
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    const createOrderWithPayment = async (args: {
      orderNumber: number;
      amount: string;
      method: PaymentMethod;
      paidAt: Date;
      paymentStatus?: 'COMPLETED' | 'PENDING';
    }) => {
      const order = await fixture.prisma.order.create({
        data: {
          tenantId: fixture.tenantId, tableId: table.id, dailyOrderNumber: args.orderNumber,
          status: args.paymentStatus === 'PENDING' ? 'NEW' : 'PAID',
          totalAmountByn: args.amount, isPaid: args.paymentStatus !== 'PENDING', paidAt: args.paidAt,
        },
      });
      await fixture.prisma.payment.create({
        data: {
          tenantId: fixture.tenantId, orderId: order.id, amountByn: args.amount,
          provider: 'test', method: args.method, status: args.paymentStatus ?? 'COMPLETED', createdAt: args.paidAt,
        },
      });
    };

    await createOrderWithPayment({ orderNumber: 1, amount: '12.50', method: 'BANK_CARD', paidAt: new Date(now.getTime() - 15 * 60 * 1000) });
    await createOrderWithPayment({ orderNumber: 2, amount: '7.50', method: 'CASH_TO_WAITER', paidAt: new Date(now.getTime() - 14 * 60 * 1000) });
    await createOrderWithPayment({ orderNumber: 3, amount: '4.00', method: 'BANK_CARD', paidAt: new Date(now.getTime() - 48 * 60 * 60 * 1000) });
    await createOrderWithPayment({ orderNumber: 4, amount: '99.00', method: 'OPLATI_QR', paidAt: now, paymentStatus: 'PENDING' });

    const revenue = await fixture.adminRequest()
      .get(`/api/v1/admin/analytics/revenue?from=${start.toISOString()}&to=${end.toISOString()}&granularity=hour`)
      .expect(200);
    const split = await fixture.adminRequest().get('/api/v1/admin/analytics/payments-split').expect(200);

    const currentHour = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Minsk', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now) + `T${new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Minsk', hour: '2-digit', hourCycle: 'h23',
    }).format(now)}:00`;
    expect(revenue.body).toEqual([{ period: currentHour, revenueByn: 20 }]);
    expect(split.body).toEqual([
      { method: 'OPLATI_QR', amountByn: 0, transactionsCount: 0 },
      { method: 'ERIP_EPOS', amountByn: 0, transactionsCount: 0 },
      { method: 'BANK_CARD', amountByn: 12.5, transactionsCount: 1 },
      { method: 'CASH_TO_WAITER', amountByn: 7.5, transactionsCount: 1 },
    ]);
  });
});
