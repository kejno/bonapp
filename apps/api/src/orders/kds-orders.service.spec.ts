import { ForbiddenException } from '@nestjs/common';
import { OrderStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { OrdersService } from './orders.service';

describe('OrdersService KDS', () => {
  type KitchenOrdersFilter = {
    where: { tenantId: string; status: { in: OrderStatus[] } };
  };
  const orders = [
    {
      id: 'order-1',
      tenantId: 'tenant-1',
      status: OrderStatus.NEW,
      items: [
        {
          id: 'hot-1',
          itemId: 'dish-1',
          status: 'NEW',
          kitchenDepartment: 'HOT',
        },
        {
          id: 'bar-1',
          itemId: 'dish-2',
          status: 'NEW',
          kitchenDepartment: 'BAR',
        },
      ],
    },
    {
      id: 'served-order',
      tenantId: 'tenant-1',
      status: OrderStatus.SERVED,
      items: [
        {
          id: 'served-hot-1',
          itemId: 'dish-1',
          status: OrderStatus.SERVED,
          kitchenDepartment: 'HOT',
        },
      ],
    },
  ];
  const orderUpdate = jest.fn();
  const orderItemUpdate = jest.fn();
  const findKitchenOrders = jest.fn((filter: KitchenOrdersFilter) =>
    orders.filter((order) => filter.where.status.in.includes(order.status)),
  );
  const transaction = {
    order: {
      findFirst: jest.fn().mockResolvedValue(orders[0]),
      update: orderUpdate,
    },
    orderItem: { updateMany: orderItemUpdate },
  };
  const prisma = {
    db: {
      user: {
        findFirst: jest.fn().mockResolvedValue({ kitchenDepartments: ['HOT'] }),
      },
      order: {
        findMany: findKitchenOrders,
        findFirst: jest.fn().mockResolvedValue(orders[0]),
        update: orderUpdate,
      },
      menuItem: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'dish-1', name: 'Суп' },
          { id: 'dish-2', name: 'Чай' },
        ]),
      },
    },
    transactionForTenant: jest.fn(
      (_tenantId: string, work: (tx: typeof transaction) => unknown) =>
        work(transaction),
    ),
  };
  const tenantContext = { getTenantId: () => 'tenant-1' };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    tenantContext as unknown as TenantContextService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns a chef only orders containing items from assigned departments', async () => {
    const result = await service.findKitchenOrders('chef-1', UserRole.CHEF);
    expect(result.departments).toEqual(['HOT']);
    expect(result.orders[0].items.map((item) => item.name)).toEqual(['Суп']);
  });

  it('includes served orders in the KDS order list', async () => {
    const result = await service.findKitchenOrders('chef-1', UserRole.CHEF);

    expect(result.orders.some((order) => order.status === OrderStatus.SERVED)).toBe(
      true,
    );
  });

  it('allows advancing cooking items to served', async () => {
    transaction.order.findFirst.mockResolvedValueOnce({
      ...orders[0],
      status: OrderStatus.COOKING,
      items: orders[0].items.map((item) => ({
        ...item,
        status: OrderStatus.COOKING,
      })),
    });

    await service.updateKitchenStatus(
      'order-1',
      OrderStatus.SERVED,
      'HOT',
      'chef-1',
      UserRole.CHEF,
    );

    expect(orderItemUpdate).toHaveBeenCalledWith({
      where: { id: { in: ['hot-1'] }, orderId: 'order-1' },
      data: { status: OrderStatus.SERVED },
    });
  });

  it('advances only the selected department and leaves the shared order status until all departments advance', async () => {
    await service.updateKitchenStatus(
      'order-1',
      OrderStatus.COOKING,
      'HOT',
      'chef-1',
      UserRole.CHEF,
    );
    expect(orderItemUpdate).toHaveBeenCalledWith({
      where: { id: { in: ['hot-1'] }, orderId: 'order-1' },
      data: { status: OrderStatus.COOKING },
    });
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('rejects a chef changing a department they are not assigned to', async () => {
    await expect(
      service.updateKitchenStatus(
        'order-1',
        OrderStatus.COOKING,
        'BAR',
        'chef-1',
        UserRole.CHEF,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
