import { Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { MenuAdminService } from './menu-admin.service';

describe('MenuAdminService', () => {
  let prisma: {
    menuItem: { update: jest.Mock };
    stopListItem: { upsert: jest.Mock };
  };
  let cache: { del: jest.Mock };
  let service: MenuAdminService;

  beforeEach(() => {
    prisma = {
      menuItem: { update: jest.fn() },
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

  it('invalidates the tenant menu immediately after a stop-list update', async () => {
    prisma.stopListItem.upsert.mockResolvedValue({ id: 'stop-list-1' });

    await service.updateStopList('tenant-1', 'item-1', true);

    expect(prisma.stopListItem.upsert).toHaveBeenCalled();
    expect(cache.del).toHaveBeenCalledWith('menu:tenant:tenant-1');
  });

  it('does not fail a stop-list update when cache invalidation fails', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    prisma.stopListItem.upsert.mockResolvedValue({ id: 'stop-list-1' });
    cache.del.mockRejectedValue(new Error('Redis unavailable'));

    await expect(
      service.updateStopList('tenant-1', 'item-1', true),
    ).resolves.toEqual({ id: 'stop-list-1' });
  });
});
