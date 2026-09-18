import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MenuService } from './menu.service';

describe('MenuService', () => {
  const prisma = {
    menuCategory: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    menuItem: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const cache = { invalidate: jest.fn() };
  const service = new MenuService(prisma as never, cache as never);

  beforeEach(() => jest.clearAllMocks());

  it('sorts categories by sort order and id within the tenant', async () => {
    prisma.menuCategory.findMany.mockResolvedValue([]);

    await service.listCategories('tenant-1');

    expect(prisma.menuCategory.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  });

  it('rejects a blank category name before persisting it', async () => {
    await expect(
      service.createCategory('tenant-1', { name: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.menuCategory.create).not.toHaveBeenCalled();
  });

  it('creates a category and invalidates the tenant menu cache', async () => {
    prisma.menuCategory.create.mockResolvedValue({ id: 'category-1' });

    await service.createCategory('tenant-1', {
      name: ' Drinks ',
      pos_category_id: 'pos-drinks',
    });

    expect(prisma.menuCategory.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        name: 'Drinks',
        sortOrder: undefined,
        isVisible: undefined,
        posCategoryId: 'pos-drinks',
      },
    });
    expect(cache.invalidate).toHaveBeenCalledWith('tenant-1');
  });

  it('filters and deterministically orders menu items', async () => {
    prisma.menuItem.findMany.mockResolvedValue([]);

    await service.listItems('tenant-1', {
      category: 'category-1',
      is_active: false,
      is_in_stop_list: true,
    });

    expect(prisma.menuItem.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        categoryId: 'category-1',
        isActive: false,
        isInStopList: true,
      },
      include: { category: true },
      orderBy: [
        { category: { sortOrder: 'asc' } },
        { categoryId: 'asc' },
        { name: 'asc' },
        { id: 'asc' },
      ],
    });
  });

  it('rejects an item with an invalid price without persisting it', async () => {
    await expect(
      service.createItem('tenant-1', {
        name: 'Soup',
        category_id: 'category-1',
        price: -1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.menuItem.create).not.toHaveBeenCalled();
  });

  it('requires an existing category belonging to the tenant to create an item', async () => {
    prisma.menuCategory.findFirst.mockResolvedValue(null);

    await expect(
      service.createItem('tenant-1', {
        name: 'Soup',
        category_id: 'category-1',
        price: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
