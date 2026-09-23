import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { MenuService } from './menu.service';

describe('MenuService', () => {
  const tenantId = 'tenant-1';
  const rawCatalog = [
    {
      id: 'category-1',
      menuItems: [
        {
          id: 'item-1',
          stopListItem: null,
          menuItemModifierGroups: [
            {
              menuItemId: 'item-1',
              modifierGroupId: 'group-1',
              tenantId: 'tenant-1',
              sortOrder: 0,
              modifierGroup: {
                id: 'group-1',
                name: 'Milk options',
                modifiers: [{ id: 'mod-1', name: 'Oat milk', sortOrder: 0 }],
              },
            },
          ],
        },
      ],
    },
    { id: 'category-2', menuItems: [{ id: 'item-2', stopListItem: null, menuItemModifierGroups: [] }] },
  ];
  const transformedCatalog = [
    {
      id: 'category-1',
      items: [
        {
          id: 'item-1',
          stopListItem: null,
          modifierGroups: [
            {
              sortOrder: 0,
              modifierGroup: {
                id: 'group-1',
                name: 'Milk options',
                modifiers: [{ id: 'mod-1', name: 'Oat milk', sortOrder: 0 }],
              },
            },
          ],
        },
      ],
    },
    { id: 'category-2', items: [{ id: 'item-2', stopListItem: null, modifierGroups: [] }] },
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
    cache.getJson.mockResolvedValue(transformedCatalog);

    await expect(service.getGuestMenu(tenantId)).resolves.toEqual(transformedCatalog);
    expect(prisma.menuCategory.findMany).not.toHaveBeenCalled();
    expect(prisma.forTenant).not.toHaveBeenCalled();
  });

  it('loads and caches all categories, items, and modifiers for 60 seconds on a miss', async () => {
    cache.getJson.mockResolvedValue(null);
    prisma.menuCategory.findMany.mockResolvedValue(rawCatalog);

    await expect(service.getGuestMenu(tenantId)).resolves.toEqual(transformedCatalog);
    expect(prisma.forTenant).toHaveBeenCalledWith(tenantId);
    expect(prisma.menuCategory.findMany).toHaveBeenCalledWith({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        menuItems: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          include: {
            menuItemModifierGroups: {
              orderBy: { sortOrder: 'asc' },
              include: {
                modifierGroup: {
                  include: {
                    modifiers: {
                      orderBy: { sortOrder: 'asc' },
                    },
                  },
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
      transformedCatalog,
      60,
    );
  });
});
