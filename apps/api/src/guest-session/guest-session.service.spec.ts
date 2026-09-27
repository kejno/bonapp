import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GuestSessionService } from './guest-session.service';

describe('GuestSessionService order status', () => {
  const findFirst = jest.fn();
  const forTenant = jest.fn(() => ({ order: { findFirst } }));
  const prisma = {
    forTenant,
  } as unknown as PrismaService;
  const service = new GuestSessionService(prisma, { emitKitchenOrder: jest.fn() } as never);

  beforeEach(() => jest.clearAllMocks());

  it('returns the guest safe order snapshot and a cooking estimate', async () => {
    const updatedAt = new Date('2026-09-26T12:00:00.000Z');
    findFirst.mockResolvedValue({ id: 'order-1', dailyOrderNumber: 48, status: 'COOKING', updatedAt });

    await expect(service.getOrderStatus('order-1', 'tenant-1', 'table-1')).resolves.toEqual({
      id: 'order-1', dailyOrderNumber: 48, status: 'COOKING',
      estimatedReadyAt: '2026-09-26T12:12:00.000Z',
      updatedAt: '2026-09-26T12:00:00.000Z',
    });
    expect(forTenant).toHaveBeenCalledWith('tenant-1');
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'order-1', tableId: 'table-1' },
      select: { id: true, dailyOrderNumber: true, status: true, updatedAt: true },
    });
  });

  it('does not expose an order associated with a different table', async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.getOrderStatus('order-1', 'tenant-1', 'table-2')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('GuestSessionService addOrderItem', () => {
  const lifecycle: string[] = [];
  const create = jest.fn();
  const update = jest.fn();
  const transaction = {
    order: { findFirst: jest.fn(), update },
    menuItem: { findFirst: jest.fn() },
    orderItem: { create },
  };
  const prisma = {
    transactionForTenant: jest.fn(async (_tenantId: string, work: (tx: typeof transaction) => unknown) => {
      const result = await work(transaction);
      lifecycle.push('commit');
      return result;
    }),
  } as unknown as PrismaService;
  const gateway = { emitKitchenOrder: jest.fn(() => lifecycle.push('emit')) };
  const service = new GuestSessionService(prisma, gateway as never);

  beforeEach(() => {
    jest.clearAllMocks();
    lifecycle.length = 0;
    transaction.order.findFirst.mockResolvedValue({ id: 'order-1', status: 'COOKING' });
    transaction.menuItem.findFirst.mockResolvedValue({
      id: 'item-1', priceByn: '5.00', kitchenDepartment: 'HOT', stopListItem: null,
    });
    create.mockResolvedValue({ id: 'order-item-1' });
    update.mockResolvedValue({});
  });

  it('places additions at the cooking stage and publishes the KDS update after commit', async () => {
    await service.addOrderItem('order-1', 'item-1', 2, 'tenant-1', 'table-1');

    expect(create).toHaveBeenCalledWith({ data: {
      orderId: 'order-1', itemId: 'item-1', quantity: 2,
      unitPriceByn: '5.00', selectedModifiers: [], status: 'COOKING',
      kitchenDepartment: 'HOT',
    } });
    expect(lifecycle).toEqual(['commit', 'emit']);
    expect(gateway.emitKitchenOrder).toHaveBeenCalledWith('tenant-1', 'order:updated', { id: 'order-1' });
  });
});
