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
                isActive: true,
                modifiers: [{ id: 'mod-1', name: 'Oat milk', sortOrder: 0 }],
              },
            },
            {
              menuItemId: 'item-1',
              modifierGroupId: 'group-2',
              tenantId: 'tenant-1',
              sortOrder: 1,
              modifierGroup: {
                id: 'group-2',
                name: 'Retired options',
                isActive: false,
                modifiers: [],
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
                isActive: true,
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

  it('does not expose internal cost or POS identifiers in the guest menu', async () => {
    cache.getJson.mockResolvedValue(null);
    const item = rawCatalog[0].menuItems[0] as Record<string, unknown>;
    item.costPriceByn = '4.25';
    item.posItemId = 'internal-pos-123';
    prisma.menuCategory.findMany.mockResolvedValue(rawCatalog);

    const result = await service.getGuestMenu(tenantId) as Array<{ items: Array<Record<string, unknown>> }>;
    const guestItem = result[0].items[0];

    expect(guestItem).not.toHaveProperty('costPriceByn');
    expect(guestItem).not.toHaveProperty('posItemId');
    expect(guestItem).toHaveProperty('id', 'item-1');
    delete item.costPriceByn;
    delete item.posItemId;
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
