import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-539 analytics daily summary (e2e)', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('calculates shift revenue, average check, order count and top dishes from paid orders', async () => {
    const area = await fixture.prisma.diningArea.create({
      data: { tenantId: fixture.tenantId, name: 'Analytics hall' },
    });
    const table = await fixture.prisma.table.create({
      data: { tenantId: fixture.tenantId, areaId: area.id, tableNumber: 1, qrToken: 'bnp539-qr' },
    });
    const category = await fixture.prisma.menuCategory.create({
      data: { tenantId: fixture.tenantId, name: 'Analytics menu', sortOrder: 0 },
    });
    const pasta = await fixture.prisma.menuItem.create({
      data: { tenantId: fixture.tenantId, categoryId: category.id, name: 'Паста', priceByn: '12.00' },
    });
    const tea = await fixture.prisma.menuItem.create({
      data: { tenantId: fixture.tenantId, categoryId: category.id, name: 'Чай', priceByn: '3.00' },
    });
    const paidAt = new Date();
    await fixture.prisma.order.create({
      data: {
        tenantId: fixture.tenantId, tableId: table.id, dailyOrderNumber: 1,
        status: 'PAID', totalAmountByn: '30.00', isPaid: true, paidAt,
        items: { create: [
          { itemId: pasta.id, quantity: 2, unitPriceByn: '12.00', selectedModifiers: [], status: 'SERVED', kitchenDepartment: 'HOT' },
          { itemId: tea.id, quantity: 2, unitPriceByn: '3.00', selectedModifiers: [], status: 'SERVED', kitchenDepartment: 'DRINKS' },
        ] },
      },
    });
    await fixture.prisma.order.create({
      data: {
        tenantId: fixture.tenantId, tableId: table.id, dailyOrderNumber: 2,
        status: 'PAID', totalAmountByn: '10.00', isPaid: true,
        paidAt: new Date(paidAt.getTime() - 60_000),
        items: { create: [
          { itemId: pasta.id, quantity: 1, unitPriceByn: '12.00', selectedModifiers: [], status: 'SERVED', kitchenDepartment: 'HOT' },
        ] },
      },
    });
    await fixture.prisma.order.create({
      data: {
        tenantId: fixture.tenantId, tableId: table.id, dailyOrderNumber: 3,
        status: 'NEW', totalAmountByn: '99.00',
        paidAt: new Date(paidAt.getTime() - 120_000),
        items: { create: [
          { itemId: tea.id, quantity: 20, unitPriceByn: '3.00', selectedModifiers: [], status: 'NEW', kitchenDepartment: 'DRINKS' },
        ] },
      },
    });

    const response = await fixture.adminRequest().get('/api/v1/admin/analytics/daily-summary').expect(200);

    expect(response.body).toMatchObject({
      revenueByn: 40,
      averageCheckByn: 20,
      ordersCount: 2,
      topDishes: [
        { name: 'Паста', quantity: 3 },
        { name: 'Чай', quantity: 2 },
      ],
    });
  });
});
