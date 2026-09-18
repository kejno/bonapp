import { Test, TestingModule } from '@nestjs/testing';
import { RKeeperMenuService } from './rkeeper.menu.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RKeeperClientFactory } from './rkeeper.client-factory';

describe('RKeeperMenuService', () => {
  let service: RKeeperMenuService;

  const mockClient = {
    getCategories: jest.fn(),
    getProducts: jest.fn(),
  };

  const mockClientFactory = {
    create: jest.fn().mockReturnValue(mockClient),
  };

  const mockPrisma = {
    posConnector: { findFirst: jest.fn() },
    menuCategory: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    menuItem: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const activeConnector = {
    id: 'conn-1',
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
        RKeeperMenuService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RKeeperClientFactory, useValue: mockClientFactory },
      ],
    }).compile();

    service = module.get<RKeeperMenuService>(RKeeperMenuService);
  });

  it('does nothing when no active connector is found', async () => {
    mockPrisma.posConnector.findFirst.mockResolvedValue(null);

    await service.importMenu('tenant-1');

    expect(mockClientFactory.create).not.toHaveBeenCalled();
  });

  it('creates r_keeper client with connector credentials', async () => {
    mockPrisma.posConnector.findFirst.mockResolvedValue(activeConnector);
    mockClient.getCategories.mockResolvedValue([]);
    mockClient.getProducts.mockResolvedValue([]);
    mockPrisma.menuCategory.findMany.mockResolvedValue([]);
    mockPrisma.menuItem.updateMany.mockResolvedValue({ count: 0 });

    await service.importMenu('tenant-1');

    expect(mockClientFactory.create).toHaveBeenCalledWith({
      baseUrl: 'http://rk.test',
      username: 'u',
      password: 'p',
    });
  });

  it('creates new categories and menu items from r_keeper', async () => {
    mockPrisma.posConnector.findFirst.mockResolvedValue(activeConnector);
    mockClient.getCategories.mockResolvedValue([
      { id: 'cat1', name: 'Pizza' },
      { id: 'cat2', name: 'Drinks' },
    ]);
    mockClient.getProducts.mockResolvedValue([
      { id: 'p1', name: 'Margherita', price: 10.5, categoryId: 'cat1' },
      { id: 'p2', name: 'Cola', price: 2.0, categoryId: 'cat2' },
    ]);
    mockPrisma.menuCategory.findFirst.mockResolvedValue(null);
    mockPrisma.menuCategory.create.mockResolvedValue({});
    mockPrisma.menuCategory.findMany.mockResolvedValue([
      { id: 'db-cat1', posCategoryId: 'cat1' },
      { id: 'db-cat2', posCategoryId: 'cat2' },
    ]);
    mockPrisma.menuItem.findFirst.mockResolvedValue(null);
    mockPrisma.menuItem.create.mockResolvedValue({});
    mockPrisma.menuItem.updateMany.mockResolvedValue({ count: 0 });

    await service.importMenu('tenant-1');

    expect(mockPrisma.menuCategory.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.menuItem.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.menuItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ posItemId: 'p1', name: 'Margherita', price: 10.5 }),
      }),
    );
  });

  it('updates existing categories and items instead of creating duplicates', async () => {
    mockPrisma.posConnector.findFirst.mockResolvedValue(activeConnector);
    mockClient.getCategories.mockResolvedValue([{ id: 'cat1', name: 'Pizza Updated' }]);
    mockClient.getProducts.mockResolvedValue([
      { id: 'p1', name: 'Margherita Updated', price: 11.0 },
    ]);
    mockPrisma.menuCategory.findFirst.mockResolvedValue({ id: 'db-cat1', posCategoryId: 'cat1' });
    mockPrisma.menuCategory.update.mockResolvedValue({});
    mockPrisma.menuCategory.findMany.mockResolvedValue([{ id: 'db-cat1', posCategoryId: 'cat1' }]);
    mockPrisma.menuItem.findFirst.mockResolvedValue({ id: 'db-p1', posItemId: 'p1' });
    mockPrisma.menuItem.update.mockResolvedValue({});
    mockPrisma.menuItem.updateMany.mockResolvedValue({ count: 0 });

    await service.importMenu('tenant-1');

    expect(mockPrisma.menuCategory.create).not.toHaveBeenCalled();
    expect(mockPrisma.menuCategory.update).toHaveBeenCalledWith({
      where: { id: 'db-cat1' },
      data: { name: 'Pizza Updated' },
    });
    expect(mockPrisma.menuItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'db-p1' },
        data: expect.objectContaining({ name: 'Margherita Updated', price: 11.0 }),
      }),
    );
  });

  it('soft-hides r_keeper items absent from the import response', async () => {
    mockPrisma.posConnector.findFirst.mockResolvedValue(activeConnector);
    mockClient.getCategories.mockResolvedValue([]);
    mockClient.getProducts.mockResolvedValue([
      { id: 'p2', name: 'Cola', price: 2.0 },
      { id: 'p3', name: 'Burger', price: 8.0 },
    ]);
    mockPrisma.menuCategory.findMany.mockResolvedValue([]);
    mockPrisma.menuItem.findFirst.mockResolvedValue(null);
    mockPrisma.menuItem.create.mockResolvedValue({});
    mockPrisma.menuItem.updateMany.mockResolvedValue({ count: 1 });

    await service.importMenu('tenant-1');

    expect(mockPrisma.menuItem.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        posItemId: { not: null },
        NOT: { posItemId: { in: ['p2', 'p3'] } },
      },
      data: { isAvailable: false },
    });
  });

  it('does not touch manually-created items (posItemId filter in updateMany)', async () => {
    mockPrisma.posConnector.findFirst.mockResolvedValue(activeConnector);
    mockClient.getCategories.mockResolvedValue([]);
    mockClient.getProducts.mockResolvedValue([{ id: 'p1', name: 'Pizza', price: 9.0 }]);
    mockPrisma.menuCategory.findMany.mockResolvedValue([]);
    mockPrisma.menuItem.findFirst.mockResolvedValue(null);
    mockPrisma.menuItem.create.mockResolvedValue({});
    mockPrisma.menuItem.updateMany.mockResolvedValue({ count: 0 });

    await service.importMenu('tenant-1');

    const [[callArgs]] = mockPrisma.menuItem.updateMany.mock.calls as [[{ where: { posItemId: unknown } }]];
    expect(callArgs.where.posItemId).toEqual({ not: null });
  });

  it('throws and propagates when r_keeper API is unreachable', async () => {
    mockPrisma.posConnector.findFirst.mockResolvedValue(activeConnector);
    mockClient.getCategories.mockRejectedValue(new Error('ECONNREFUSED'));
    mockClient.getProducts.mockResolvedValue([]);

    await expect(service.importMenu('tenant-1')).rejects.toThrow('ECONNREFUSED');
  });
});
