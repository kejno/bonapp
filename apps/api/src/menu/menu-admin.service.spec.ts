import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { MenuAdminService } from './menu-admin.service';

describe('MenuAdminService', () => {
  let prisma: {
    forTenant: jest.Mock;
    menuItem: { update: jest.Mock; findUnique: jest.Mock };
    menuCategory: { update: jest.Mock };
    modifierGroup: { update: jest.Mock };
    modifier: { update: jest.Mock };
    stopListItem: { upsert: jest.Mock };
  };
  let cache: { del: jest.Mock };
  let service: MenuAdminService;

  beforeEach(() => {
    prisma = {
      forTenant: jest.fn(),
      menuItem: { update: jest.fn(), findUnique: jest.fn() },
      menuCategory: { update: jest.fn() },
      modifierGroup: { update: jest.fn() },
      modifier: { update: jest.fn() },
      stopListItem: { upsert: jest.fn() },
    };
    prisma.forTenant.mockReturnValue(prisma);
    cache = { del: jest.fn() };
    service = new MenuAdminService(
      prisma as unknown as PrismaService,
      cache as unknown as CacheService,
    );
  });

  it('invalidates the tenant menu after changing an item', async () => {
    prisma.menuItem.update.mockResolvedValue({ id: 'item-1' });

    await service.updateItem('tenant-1', 'item-1', { name: 'New name' });

    expect(prisma.forTenant).toHaveBeenCalledWith('tenant-1');
    expect(cache.del).toHaveBeenCalledWith('menu:tenant:tenant-1');
  });

  it('invalidates the tenant menu after changing its price and availability', async () => {
    prisma.menuItem.update.mockResolvedValue({ id: 'item-1' });

    await service.updateItem('tenant-1', 'item-1', {
      priceByn: 12.5,
      isActive: false,
    });

    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { tenantId_id: { tenantId: 'tenant-1', id: 'item-1' } },
      data: { priceByn: 12.5, isActive: false },
    });
    expect(cache.del).toHaveBeenCalledWith('menu:tenant:tenant-1');
  });

  it('invalidates the tenant menu after replacing its modifier groups', async () => {
    prisma.menuItem.update.mockResolvedValue({ id: 'item-1' });

    await service.updateItem('tenant-1', 'item-1', {
      modifierGroups: { set: [] },
    });

    expect(cache.del).toHaveBeenCalledWith('menu:tenant:tenant-1');
  });

  it('invalidates the tenant menu after changing a category', async () => {
    prisma.menuCategory.update.mockResolvedValue({ id: 'category-1' });

    await service.updateCategory('tenant-1', 'category-1', { name: 'Breakfast' });

    expect(prisma.menuCategory.update).toHaveBeenCalledWith({
      where: { tenantId_id: { tenantId: 'tenant-1', id: 'category-1' } },
      data: { name: 'Breakfast' },
    });
    expect(cache.del).toHaveBeenCalledWith('menu:tenant:tenant-1');
  });

  it.each([
    ['modifier group', 'group-1', 'modifierGroup', 'updateModifierGroup', { name: 'Extras' }],
    ['modifier', 'modifier-1', 'modifier', 'updateModifier', { name: 'Cheese' }],
  ] as const)(
    'invalidates the tenant menu after changing a %s',
    async (_entity, id, model, method, data) => {
      prisma[model].update.mockResolvedValue({ id });

      await service[method]('tenant-1', id, data);

      expect(prisma[model].update).toHaveBeenCalledWith({
        where: { id_tenantId: { id, tenantId: 'tenant-1' } },
        data,
      });
      expect(cache.del).toHaveBeenCalledWith('menu:tenant:tenant-1');
    },
  );

  it('invalidates the tenant menu immediately after a stop-list update', async () => {
    prisma.menuItem.findUnique.mockResolvedValue({ id: 'item-1' });
    prisma.stopListItem.upsert.mockResolvedValue({ id: 'stop-list-1' });

    await service.updateStopList('tenant-1', 'item-1', true);

    expect(prisma.stopListItem.upsert).toHaveBeenCalled();
    expect(cache.del).toHaveBeenCalledWith('menu:tenant:tenant-1');
  });

  it('rejects a stop-list update when the item belongs to another tenant', async () => {
    prisma.menuItem.findUnique.mockResolvedValue(null);

    await expect(
      service.updateStopList('tenant-b', 'item-from-tenant-a', true),
    ).rejects.toThrow('not found');
    expect(prisma.stopListItem.upsert).not.toHaveBeenCalled();
    expect(cache.del).not.toHaveBeenCalled();
  });
});
