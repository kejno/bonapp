import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { MenuAdminService } from './menu-admin.service';

describe('BNP-363: modifier groups and options', () => {
  it('creates a modifier option for an active group and invalidates the tenant menu', async () => {
    const prisma = {
      forTenant: jest.fn(),
      modifierGroup: { findFirst: jest.fn().mockResolvedValue({ id: 'group-1' }) },
      modifierOption: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'option-1', name: 'Большой', extraPriceByn: 2 }) },
    };
    prisma.forTenant.mockReturnValue(prisma);
    const cache = { del: jest.fn() };
    const service = new MenuAdminService(prisma as unknown as PrismaService, cache as unknown as CacheService);

    await expect(service.createModifierOption('tenant-1', 'group-1', { id: 'option-1', name: 'Большой', extraPriceByn: 2 })).resolves.toEqual({ id: 'option-1', name: 'Большой', extraPriceByn: 2 });
    expect(prisma.modifierOption.create).toHaveBeenCalledWith({ data: { id: 'option-1', groupId: 'group-1', name: 'Большой', extraPriceByn: 2, isDefault: false } });
    expect(cache.del).toHaveBeenCalledWith('menu:tenant:tenant-1');
  });
});
