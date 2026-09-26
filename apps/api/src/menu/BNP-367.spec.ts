import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { MenuCatalogService } from './menu-catalog.service';

describe('BNP-367: admin menu item CRUD and filters', () => {
  it('returns filtered tenant items and maps item fields for the admin contract', async () => {
    const item = { id: 'item-1', tenantId: 'tenant-1', categoryId: 'category-1', name: 'Борщ', priceByn: '12.00', isActive: true, isInStopList: false };
    const prisma = { forTenant: jest.fn(), menuItem: { findMany: jest.fn().mockResolvedValue([item]) } };
    prisma.forTenant.mockReturnValue(prisma);
    const service = new MenuCatalogService(prisma as unknown as PrismaService, { del: jest.fn() } as unknown as CacheService, {} as never);

    await expect(service.listItems('tenant-1', { categoryId: 'category-1', isActive: true })).resolves.toEqual([
      expect.objectContaining({ id: 'item-1', categoryId: 'category-1', name: 'Борщ', price: 1200, isActive: true }),
    ]);
    expect(prisma.menuItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1', categoryId: 'category-1', isActive: true } }));
  });

  it('creates and updates an item using minor currency units', async () => {
    const created = { id: 'item-2', tenantId: 'tenant-1', categoryId: 'category-1', name: 'Суп', priceByn: 8.5, isActive: true };
    const prisma = {
      forTenant: jest.fn(),
      transactionForTenant: jest.fn(),
      menuItem: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(created), update: jest.fn().mockResolvedValue({ ...created, name: 'Новый суп' }) },
    };
    prisma.forTenant.mockReturnValue(prisma);
    prisma.transactionForTenant.mockImplementation(async (_tenantId: string, operation: (tx: typeof prisma) => Promise<unknown>) => operation(prisma));
    const cache = { del: jest.fn() };
    const service = new MenuCatalogService(prisma as unknown as PrismaService, cache as unknown as CacheService, {} as never);

    await expect(service.createItem('tenant-1', { name: 'Суп', categoryId: 'category-1', price: 850 })).resolves.toMatchObject({ id: 'item-2', price: 850 });
    await expect(service.updateItem('tenant-1', 'item-2', { name: 'Новый суп' })).resolves.toMatchObject({ name: 'Новый суп', price: 850 });
    expect(prisma.menuItem.update).toHaveBeenCalledWith({ where: { tenantId_id: { tenantId: 'tenant-1', id: 'item-2' } }, data: { name: 'Новый суп' } });
    expect(cache.del).toHaveBeenCalledTimes(2);
  });
});
