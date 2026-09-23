import { CacheService } from '../src/cache/cache.service';
import { MenuAdminService } from '../src/menu/menu-admin.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('BNP-342: modifier changes invalidate guest menu cache', () => {
  const tenantId = 'tenant-342';
  let prisma: {
    forTenant: jest.Mock;
    modifierGroup: { update: jest.Mock };
    modifier: { update: jest.Mock };
  };
  let cache: { del: jest.Mock };
  let service: MenuAdminService;

  beforeEach(() => {
    prisma = {
      forTenant: jest.fn(),
      modifierGroup: { update: jest.fn() },
      modifier: { update: jest.fn() },
    };
    prisma.forTenant.mockReturnValue(prisma);
    cache = { del: jest.fn() };
    service = new MenuAdminService(
      prisma as unknown as PrismaService,
      cache as unknown as CacheService,
    );
  });

  it.each([
    ['modifier group', 'modifier-group-342', 'modifierGroup', 'updateModifierGroup'],
    ['modifier', 'modifier-342', 'modifier', 'updateModifier'],
  ] as const)(
    'invalidates the tenant cache after changing a %s',
    async (_entity, id, model, method) => {
      prisma[model].update.mockResolvedValue({ id });

      await service[method](tenantId, id, { name: `Updated ${id}` });

      expect(prisma[model].update).toHaveBeenCalledWith({
        where: { id_tenantId: { id, tenantId } },
        data: { name: `Updated ${id}` },
      });
      expect(cache.del).toHaveBeenCalledWith(`menu:tenant:${tenantId}`);
    },
  );
});
