import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const prisma = {
    order: {
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    restaurantTable: { update: jest.fn() },
    payment: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const events = { publishStatusChanged: jest.fn() };
  const service = new OrdersService(prisma as never, events);

  beforeEach(() => jest.clearAllMocks());

  it('changes NEW order to COOKING and publishes to guest and KDS rooms', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'order-1', status: OrderStatus.NEW });
    prisma.order.update.mockResolvedValue({ id: 'order-1', status: OrderStatus.COOKING });

    await expect(service.changeStatus('tenant-1', 'order-1', OrderStatus.COOKING)).resolves.toEqual({
      id: 'order-1', status: OrderStatus.COOKING,
    });
    expect(events.publishStatusChanged).toHaveBeenCalledWith('tenant-1', 'order-1', OrderStatus.COOKING);
  });

  it('rejects a backwards transition', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'order-1', status: OrderStatus.COOKING });

    await expect(service.changeStatus('tenant-1', 'order-1', OrderStatus.NEW)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('rejects direct transition to PAID', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'order-1', status: OrderStatus.SERVED });

    await expect(service.changeStatus('tenant-1', 'order-1', OrderStatus.PAID)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks a served order as PAID only after a successful payment and frees its table', async () => {
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    prisma.order.findFirst.mockResolvedValue({ id: 'order-1', status: OrderStatus.SERVED, tableId: 'table-1' });
    prisma.payment.findFirst.mockResolvedValue({ id: 'payment-1' });
    prisma.order.update.mockResolvedValue({ id: 'order-1', status: OrderStatus.PAID });

    await expect(service.markPaidAfterSuccessfulPayment('tenant-1', 'order-1', 'payment-1')).resolves.toEqual({
      id: 'order-1', status: OrderStatus.PAID,
    });
    expect(prisma.restaurantTable.update).toHaveBeenCalledWith({ where: { id: 'table-1' }, data: { status: 'FREE' } });
    expect(events.publishStatusChanged).toHaveBeenCalledWith('tenant-1', 'order-1', OrderStatus.PAID);
  });

  it('aggregates two identical item snapshots within an active order', async () => {
    prisma.order.findMany.mockResolvedValue([{ id: 'order-1', status: OrderStatus.NEW, items: [
      { kitchenId: 'kitchen-1', menuItemId: 'item-1', name: 'Soup', quantity: 1 },
      { kitchenId: 'kitchen-1', menuItemId: 'item-1', name: 'Soup', quantity: 2 },
    ] }]);

    await expect(service.findActive('tenant-1')).resolves.toEqual([{ id: 'order-1', status: OrderStatus.NEW, items: [
      { kitchenId: 'kitchen-1', menuItemId: 'item-1', name: 'Soup', quantity: 3 },
    ] }]);
  });
});
