import { Test, TestingModule } from '@nestjs/testing';
import { RKeeperOrderService } from './rkeeper.order.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RKeeperClientFactory } from './rkeeper.client-factory';

describe('RKeeperOrderService', () => {
  let service: RKeeperOrderService;

  const mockClient = { createOrder: jest.fn() };
  const mockClientFactory = { create: jest.fn().mockReturnValue(mockClient) };

  const mockPrisma = {
    posConnector: { findFirst: jest.fn() },
    order: { findUnique: jest.fn(), update: jest.fn() },
  };

  const activeConnector = {
    tenantId: 'tenant-1',
    posType: 'RKEEPER',
    baseUrl: 'http://rk.test',
    username: 'u',
    passwordEncrypted: 'p',
    isActive: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RKeeperOrderService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RKeeperClientFactory, useValue: mockClientFactory },
      ],
    }).compile();

    service = module.get<RKeeperOrderService>(RKeeperOrderService);
  });

  it('does nothing when no active connector found', async () => {
    mockPrisma.posConnector.findFirst.mockResolvedValue(null);

    await service.sendOrder('tenant-1', 'order-1');

    expect(mockClientFactory.create).not.toHaveBeenCalled();
  });

  it('does nothing when order not found in DB', async () => {
    mockPrisma.posConnector.findFirst.mockResolvedValue(activeConnector);
    mockPrisma.order.findUnique.mockResolvedValue(null);

    await service.sendOrder('tenant-1', 'order-1');

    expect(mockClientFactory.create).not.toHaveBeenCalled();
  });

  it('sends all order items to r_keeper and saves posOrderId', async () => {
    mockPrisma.posConnector.findFirst.mockResolvedValue(activeConnector);
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      items: [
        { quantity: 2, price: 10.5, menuItem: { id: 'mi-1', posItemId: 'p1' } },
        { quantity: 1, price: 3.0, menuItem: { id: 'mi-2', posItemId: 'p2' } },
      ],
    });
    mockClient.createOrder.mockResolvedValue({ id: 'rk-order-42' });
    mockPrisma.order.update.mockResolvedValue({});

    await service.sendOrder('tenant-1', 'order-1');

    expect(mockClient.createOrder).toHaveBeenCalledWith({
      items: [
        { productId: 'p1', amount: 2, price: 10.5 },
        { productId: 'p2', amount: 1, price: 3.0 },
      ],
    });
    expect(mockPrisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { posOrderId: 'rk-order-42', status: 'SENT_TO_POS' },
    });
  });

  it('does not throw when r_keeper API fails — order stays in Bonapp', async () => {
    mockPrisma.posConnector.findFirst.mockResolvedValue(activeConnector);
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      items: [{ quantity: 1, price: 5.0, menuItem: { id: 'mi-1', posItemId: 'p1' } }],
    });
    mockClient.createOrder.mockRejectedValue(new Error('Connection refused'));

    await expect(service.sendOrder('tenant-1', 'order-1')).resolves.toBeUndefined();
    expect(mockPrisma.order.update).not.toHaveBeenCalled();
  });

  it('skips items without posItemId and sends only mappable items', async () => {
    mockPrisma.posConnector.findFirst.mockResolvedValue(activeConnector);
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      items: [
        { quantity: 2, price: 10.5, menuItem: { id: 'mi-1', posItemId: 'p1' } },
        { quantity: 1, price: 5.0, menuItem: { id: 'mi-2', posItemId: null } },
      ],
    });
    mockClient.createOrder.mockResolvedValue({ id: 'rk-order-43' });
    mockPrisma.order.update.mockResolvedValue({});

    await service.sendOrder('tenant-1', 'order-1');

    expect(mockClient.createOrder).toHaveBeenCalledWith({
      items: [{ productId: 'p1', amount: 2, price: 10.5 }],
    });
  });

  it('does nothing when all order items lack posItemId', async () => {
    mockPrisma.posConnector.findFirst.mockResolvedValue(activeConnector);
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      items: [{ quantity: 1, price: 5.0, menuItem: { id: 'mi-1', posItemId: null } }],
    });

    await service.sendOrder('tenant-1', 'order-1');

    expect(mockClient.createOrder).not.toHaveBeenCalled();
  });
});
