import { CacheService } from '../src/cache/cache.service';
import { MenuAdminService } from '../src/menu/menu-admin.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('BNP-341: item and category changes invalidate guest menu cache', () => {
  const tenantId = 'tenant-341';
  let prisma: {
    forTenant: jest.Mock;
    menuItem: { update: jest.Mock };
    menuCategory: { update: jest.Mock };
  };
  let cache: { del: jest.Mock };
  let service: MenuAdminService;

  beforeEach(() => {
    prisma = {
      forTenant: jest.fn(),
      menuItem: { update: jest.fn() },
      menuCategory: { update: jest.fn() },
    };
    prisma.forTenant.mockReturnValue(prisma);
    cache = { del: jest.fn() };
    service = new MenuAdminService(
      prisma as unknown as PrismaService,
      cache as unknown as CacheService,
    );
  });

  it.each([
    ['item', 'item-341', 'menuItem', 'updateItem'],
    ['category', 'category-341', 'menuCategory', 'updateCategory'],
  ] as const)(
    'invalidates the tenant cache after changing a menu %s',
    async (_entity, id, model, method) => {
      prisma[model].update.mockResolvedValue({ id });

      await service[method](tenantId, id, { name: `Updated ${id}` });

      expect(prisma[model].update).toHaveBeenCalledWith({
        where: { tenantId_id: { tenantId, id } },
        data: { name: `Updated ${id}` },
      });
      expect(cache.del).toHaveBeenCalledWith(`menu:tenant:${tenantId}`);
    },
  );
});
