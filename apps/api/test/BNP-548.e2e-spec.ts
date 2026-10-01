import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-548 analytics transaction CSV export (e2e)', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('downloads CSV with transaction rows for the requested period', async () => {
    const area = await fixture.prisma.diningArea.create({
      data: { tenantId: fixture.tenantId, name: 'CSV hall' },
    });
    const table = await fixture.prisma.table.create({
      data: { tenantId: fixture.tenantId, areaId: area.id, tableNumber: 1, qrToken: 'bnp548-qr' },
    });
    const order = await fixture.prisma.order.create({
      data: { tenantId: fixture.tenantId, tableId: table.id, dailyOrderNumber: 548, totalAmountByn: '12.50' },
    });
    const createdAt = new Date('2026-03-08T10:30:00.000Z');
    await fixture.prisma.payment.create({
      data: {
        tenantId: fixture.tenantId, orderId: order.id, amountByn: '12.50', tipsAmountByn: '1.25',
        provider: 'test', method: 'BANK_CARD', status: 'COMPLETED', createdAt,
      },
    });

    const response = await fixture.adminRequest()
      .get('/api/v1/admin/analytics/transactions/export?from=2026-03-08&to=2026-03-08')
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv; charset=utf-8');
    expect(response.headers['content-disposition']).toContain('attachment; filename="transactions.csv"');
    expect(response.text).toContain('\uFEFF"Дата";"Заказ";"Метод оплаты";"Статус";"Сумма BYN";"Чаевые BYN"');
    expect(response.text).toContain('"2026-03-08T10:30:00.000Z";"548";"BANK_CARD";"COMPLETED";"12.50";"1.25"');
  });
});
