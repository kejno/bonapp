import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { MenuService } from './menu.service';

describe('MenuService', () => {
  const tenantId = 'tenant-1';
  const catalog = [
    { id: 'category-1', items: [{ id: 'item-1', modifierGroups: [] }] },
    { id: 'category-2', items: [{ id: 'item-2', modifierGroups: [] }] },
  ];

  let prisma: {
    forTenant: jest.Mock;
    menuCategory: { findMany: jest.Mock };
  };
  let cache: { getJson: jest.Mock; setJson: jest.Mock };
  let service: MenuService;

  beforeEach(() => {
    prisma = {
      forTenant: jest.fn(),
      menuCategory: { findMany: jest.fn() },
    };
    prisma.forTenant.mockReturnValue(prisma);
    cache = { getJson: jest.fn(), setJson: jest.fn() };
    service = new MenuService(
      prisma as unknown as PrismaService,
      cache as unknown as CacheService,
    );
  });

  it('returns a cached complete catalog without querying the database', async () => {
    cache.getJson.mockResolvedValue(catalog);

    await expect(service.getGuestMenu(tenantId)).resolves.toEqual(catalog);
    expect(prisma.menuCategory.findMany).not.toHaveBeenCalled();
    expect(prisma.forTenant).not.toHaveBeenCalled();
  });

  it('loads and caches all categories, items, and modifiers for 60 seconds on a miss', async () => {
    cache.getJson.mockResolvedValue(null);
    prisma.menuCategory.findMany.mockResolvedValue(catalog);

    await expect(service.getGuestMenu(tenantId)).resolves.toEqual(catalog);
    expect(prisma.forTenant).toHaveBeenCalledWith(tenantId);
    expect(prisma.menuCategory.findMany).toHaveBeenCalledWith({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            modifierGroups: {
              orderBy: { sortOrder: 'asc' },
              include: {
                modifierGroup: {
                  include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
                },
              },
            },
            stopListItem: { select: { isStopped: true } },
          },
        },
      },
    });
    expect(cache.setJson).toHaveBeenCalledWith(
      `menu:tenant:${tenantId}`,
      catalog,
      60,
    );
  });
});
