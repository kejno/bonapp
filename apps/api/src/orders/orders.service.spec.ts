import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const order = {
    qrToken: 'table-token',
    comment: 'Less salt',
    items: [
      { menuItemId: 'coffee', quantity: 2, selectedModifiers: ['oat'] },
      { menuItemId: 'tea', quantity: 1, selectedModifiers: [] },
    ],
  };

  const prisma = {
    tenant: { findUnique: jest.fn() },
    menuItem: { findMany: jest.fn() },
    dailyOrderCounter: { upsert: jest.fn() },
    order: { create: jest.fn() },
    $transaction: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
    prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', timezone: 'Europe/Minsk' });
    prisma.menuItem.findMany.mockResolvedValue([
      {
        id: 'coffee', name: 'Coffee', priceByn: 5, isAvailable: true,
        modifierGroups: [{ isRequired: true, options: [{ id: 'oat', priceByn: 1, isAvailable: true }] }],
      },
      { id: 'tea', name: 'Tea', priceByn: 3, isAvailable: true, modifierGroups: [] },
    ]);
    prisma.dailyOrderCounter.upsert.mockResolvedValue({ lastNumber: 5 });
    prisma.order.create.mockResolvedValue({
      id: 'order-1', dailyOrderNumber: 5, status: 'NEW', totalAmountByn: 15,
      estimatedReadyTime: new Date('2026-09-18T10:15:00.000Z'),
    });
  });

  it('creates an order with server-calculated menu and modifier prices', async () => {
    const service = new OrdersService(prisma);

    await expect(service.create(order)).resolves.toEqual({
      orderId: 'order-1', dailyOrderNumber: 5, status: 'NEW', totalAmountByn: 15,
      estimatedReadyTime: '2026-09-18T10:15:00.000Z',
    });
    expect(prisma.order.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-1', dailyOrderNumber: 5, totalAmountByn: 15 }),
    }));
  });

  it('rejects an item from the stop list', async () => {
    prisma.menuItem.findMany.mockResolvedValue([{ id: 'coffee', priceByn: 5, isAvailable: false, modifierGroups: [] }]);
    const service = new OrdersService(prisma);

    await expect(service.create({ ...order, items: [{ menuItemId: 'coffee', quantity: 1, selectedModifiers: [] }] }))
      .rejects.toThrow(new BadRequestException('Блюдо недоступно для заказа'));
  });

  it('rejects an item without a required modifier', async () => {
    const service = new OrdersService(prisma);

    await expect(service.create({ ...order, items: [{ menuItemId: 'coffee', quantity: 1, selectedModifiers: [] }] }))
      .rejects.toThrow(new BadRequestException('Выберите обязательный модификатор'));
  });
});
