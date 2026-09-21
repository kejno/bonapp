import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { MenuAdminService } from './menu-admin.service';

describe('MenuAdminService', () => {
  let prisma: {
    menuItem: { update: jest.Mock; findUnique: jest.Mock };
    stopListItem: { upsert: jest.Mock };
  };
  let cache: { del: jest.Mock };
  let service: MenuAdminService;

  beforeEach(() => {
    prisma = {
      menuItem: { update: jest.fn(), findUnique: jest.fn() },
      stopListItem: { upsert: jest.fn() },
    };
    cache = { del: jest.fn() };
    service = new MenuAdminService(
      prisma as unknown as PrismaService,
      cache as unknown as CacheService,
    );
  });

  it('invalidates the tenant menu after changing an item', async () => {
    prisma.menuItem.update.mockResolvedValue({ id: 'item-1' });

    await service.updateItem('tenant-1', 'item-1', { name: 'New name' });

    expect(cache.del).toHaveBeenCalledWith('menu:tenant:tenant-1');
  });

  it('invalidates the tenant menu after changing its price and availability', async () => {
    prisma.menuItem.update.mockResolvedValue({ id: 'item-1' });

    await service.updateItem('tenant-1', 'item-1', {
      price: 12.5,
      isActive: false,
    });

    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { id_tenantId: { id: 'item-1', tenantId: 'tenant-1' } },
      data: { price: 12.5, isActive: false },
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
