import { NotFoundException } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { MenuAdminService } from './menu-admin.service';

describe('MenuAdminService', () => {
  let prisma: {
    forTenant: jest.Mock;
    transactionForTenant: jest.Mock;
    menuItem: { update: jest.Mock; findUnique: jest.Mock; findFirst: jest.Mock };
    menuCategory: { update: jest.Mock };
    modifierGroup: { update: jest.Mock; findMany: jest.Mock; create: jest.Mock; findFirst: jest.Mock };
    modifierOption: { findFirst: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
    modifier: { update: jest.Mock };
    stopListItem: { upsert: jest.Mock };
  };
  let cache: { del: jest.Mock };
  let service: MenuAdminService;

  beforeEach(() => {
    prisma = {
      forTenant: jest.fn(),
      transactionForTenant: jest.fn(),
      menuItem: { update: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
      menuCategory: { update: jest.fn() },
      modifierGroup: { update: jest.fn(), findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
      modifierOption: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
      modifier: { update: jest.fn() },
      stopListItem: { upsert: jest.fn() },
    };
    prisma.forTenant.mockReturnValue(prisma);
    prisma.transactionForTenant.mockImplementation(
      async (_tenantId: string, operation: (tx: typeof prisma) => Promise<unknown>) => operation(prisma),
    );
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

    expect(prisma.stopListItem.upsert).toHaveBeenCalledWith({
      where: { tenantId_menuItemId: { tenantId: 'tenant-1', menuItemId: 'item-1' } },
      create: { tenantId: 'tenant-1', menuItemId: 'item-1', isStopped: true },
      update: { isStopped: true },
    });
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

  // --- listModifierGroups ---

  it('returns active modifier groups with active options for an item', async () => {
    prisma.menuItem.findFirst.mockResolvedValue({ id: 'item-1' });
    prisma.modifierGroup.findMany.mockResolvedValue([{ id: 'group-1', modifierOptions: [] }]);

    const result = await service.listModifierGroups('tenant-1', 'item-1');

    expect(prisma.modifierGroup.findMany).toHaveBeenCalledWith({
      where: { itemId: 'item-1', isActive: true },
      include: { modifierOptions: { where: { isActive: true } } },
    });
    expect(result).toEqual([{ id: 'group-1', modifierOptions: [] }]);
  });

  it('rejects listModifierGroups when item is not found', async () => {
    prisma.menuItem.findFirst.mockResolvedValue(null);

    await expect(service.listModifierGroups('tenant-1', 'unknown')).rejects.toThrow(NotFoundException);
    expect(prisma.modifierGroup.findMany).not.toHaveBeenCalled();
  });

  // --- createModifierGroup ---

  it('creates a modifier group with min/max selection and invalidates cache', async () => {
    prisma.menuItem.findFirst.mockResolvedValue({ id: 'item-1' });
    prisma.modifierGroup.create.mockResolvedValue({ id: 'group-1' });

    await service.createModifierGroup('tenant-1', 'item-1', { name: 'Size', minSelected: 1, maxSelected: 1 });

    expect(prisma.modifierGroup.create).toHaveBeenCalledWith({
      data: { tenantId: 'tenant-1', itemId: 'item-1', name: 'Size', minSelection: 1, maxSelection: 1 },
      include: { modifierOptions: true },
    });
    expect(cache.del).toHaveBeenCalledWith('menu:tenant:tenant-1');
  });

  it('defaults minSelection to 0 and maxSelection to null when not provided', async () => {
    prisma.menuItem.findFirst.mockResolvedValue({ id: 'item-1' });
    prisma.modifierGroup.create.mockResolvedValue({ id: 'group-1' });

    await service.createModifierGroup('tenant-1', 'item-1', { name: 'Extras' });

    expect(prisma.modifierGroup.create).toHaveBeenCalledWith({
      data: { tenantId: 'tenant-1', itemId: 'item-1', name: 'Extras', minSelection: 0, maxSelection: null },
      include: { modifierOptions: true },
    });
  });

  it('rejects createModifierGroup when item is not found', async () => {
    prisma.menuItem.findFirst.mockResolvedValue(null);

    await expect(service.createModifierGroup('tenant-1', 'unknown', { name: 'Size' })).rejects.toThrow(NotFoundException);
    expect(prisma.modifierGroup.create).not.toHaveBeenCalled();
  });

  // --- deactivateModifierGroup ---

  it('deactivates the group and all its options, then invalidates cache', async () => {
    prisma.modifierGroup.findFirst.mockResolvedValue({ id: 'group-1' });
    prisma.modifierOption.updateMany.mockResolvedValue({ count: 2 });
    prisma.modifierGroup.update.mockResolvedValue({ id: 'group-1', isActive: false });

    const result = await service.deactivateModifierGroup('tenant-1', 'group-1');

    expect(prisma.modifierOption.updateMany).toHaveBeenCalledWith({
      where: { groupId: 'group-1', group: { is: { tenantId: 'tenant-1' } } },
      data: { isActive: false },
    });
    expect(prisma.modifierGroup.update).toHaveBeenCalledWith({
      where: { id_tenantId: { id: 'group-1', tenantId: 'tenant-1' } },
      data: { isActive: false },
    });
    expect(prisma.transactionForTenant).toHaveBeenCalledWith('tenant-1', expect.any(Function));
    expect(cache.del).toHaveBeenCalledWith('menu:tenant:tenant-1');
    expect(result).toEqual({ id: 'group-1', isActive: false });
  });

  it('rejects deactivateModifierGroup when group does not belong to tenant', async () => {
    prisma.modifierGroup.findFirst.mockResolvedValue(null);

    await expect(service.deactivateModifierGroup('tenant-b', 'group-from-a')).rejects.toThrow(NotFoundException);
    expect(prisma.modifierOption.updateMany).not.toHaveBeenCalled();
    expect(cache.del).not.toHaveBeenCalled();
  });

  // --- createModifierOption ---

  it('creates a modifier option with all fields and invalidates cache', async () => {
    prisma.modifierGroup.findFirst.mockResolvedValue({ id: 'group-1' });
    prisma.modifierOption.create.mockResolvedValue({ id: 'opt-1' });

    await service.createModifierOption('tenant-1', 'group-1', {
      name: 'Large',
      extraPriceByn: 1.5,
      isDefault: true,
    });

    expect(prisma.modifierOption.create).toHaveBeenCalledWith({
      data: { groupId: 'group-1', name: 'Large', extraPriceByn: 1.5, isDefault: true },
    });
    expect(cache.del).toHaveBeenCalledWith('menu:tenant:tenant-1');
  });

  it('defaults extraPriceByn to 0 and isDefault to false when not provided', async () => {
    prisma.modifierGroup.findFirst.mockResolvedValue({ id: 'group-1' });
    prisma.modifierOption.create.mockResolvedValue({ id: 'opt-1' });

    await service.createModifierOption('tenant-1', 'group-1', { name: 'Small' });

    expect(prisma.modifierOption.create).toHaveBeenCalledWith({
      data: { groupId: 'group-1', name: 'Small', extraPriceByn: 0, isDefault: false },
    });
  });

  it('rejects createModifierOption when group does not belong to tenant', async () => {
    prisma.modifierGroup.findFirst.mockResolvedValue(null);

    await expect(
      service.createModifierOption('tenant-b', 'group-from-a', { name: 'X' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.modifierOption.create).not.toHaveBeenCalled();
  });

  // --- updateModifierOption ---

  it('updates modifier option fields and invalidates cache', async () => {
    prisma.modifierOption.findFirst
      .mockResolvedValueOnce({ id: 'opt-1' })
      .mockResolvedValueOnce({ id: 'opt-1', name: 'XL', extraPriceByn: 2 });

    const result = await service.updateModifierOption('tenant-1', 'opt-1', { name: 'XL', extraPriceByn: 2 });

    expect(prisma.modifierOption.updateMany).toHaveBeenCalledWith({
      where: { id: 'opt-1' },
      data: { name: 'XL', extraPriceByn: 2 },
    });
    expect(cache.del).toHaveBeenCalledWith('menu:tenant:tenant-1');
    expect(result).toEqual({ id: 'opt-1', name: 'XL', extraPriceByn: 2 });
  });

  it('rejects updateModifierOption when option does not belong to tenant', async () => {
    prisma.modifierOption.findFirst.mockResolvedValue(null);

    await expect(
      service.updateModifierOption('tenant-b', 'opt-from-a', { name: 'X' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.modifierOption.updateMany).not.toHaveBeenCalled();
  });

  it('rejects updateModifierOption when the option is removed after it is updated', async () => {
    prisma.modifierOption.findFirst
      .mockResolvedValueOnce({ id: 'opt-1' })
      .mockResolvedValueOnce(null);
    prisma.modifierOption.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.updateModifierOption('tenant-1', 'opt-1', { name: 'XL' }),
    ).rejects.toThrow(NotFoundException);
  });

  // --- deactivateModifierOption ---

  it('deactivates a modifier option and invalidates cache', async () => {
    prisma.modifierOption.findFirst
      .mockResolvedValueOnce({ id: 'opt-1' })
      .mockResolvedValueOnce({ id: 'opt-1', isActive: false });

    const result = await service.deactivateModifierOption('tenant-1', 'opt-1');

    expect(prisma.modifierOption.updateMany).toHaveBeenCalledWith({
      where: { id: 'opt-1' },
      data: { isActive: false },
    });
    expect(cache.del).toHaveBeenCalledWith('menu:tenant:tenant-1');
    expect(result).toEqual({ id: 'opt-1', isActive: false });
  });

  it('rejects deactivateModifierOption when option does not belong to tenant', async () => {
    prisma.modifierOption.findFirst.mockResolvedValue(null);

    await expect(service.deactivateModifierOption('tenant-b', 'opt-from-a')).rejects.toThrow(NotFoundException);
    expect(prisma.modifierOption.updateMany).not.toHaveBeenCalled();
  });

  it('rejects deactivateModifierOption when the option is removed after deactivation', async () => {
    prisma.modifierOption.findFirst
      .mockResolvedValueOnce({ id: 'opt-1' })
      .mockResolvedValueOnce(null);
    prisma.modifierOption.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.deactivateModifierOption('tenant-1', 'opt-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  // --- updateItemStopList ---

  it('updates isInStopList on the menu item and invalidates cache', async () => {
    prisma.menuItem.findFirst.mockResolvedValue({ id: 'item-1' });
    prisma.menuItem.update.mockResolvedValue({ id: 'item-1', isInStopList: true });

    const result = await service.updateItemStopList('tenant-1', 'item-1', true);

    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { tenantId_id: { tenantId: 'tenant-1', id: 'item-1' } },
      data: { isInStopList: true },
    });
    expect(cache.del).toHaveBeenCalledWith('menu:tenant:tenant-1');
    expect(result).toEqual({ id: 'item-1', isInStopList: true });
  });

  it('rejects updateItemStopList when item does not belong to tenant', async () => {
    prisma.menuItem.findFirst.mockResolvedValue(null);

    await expect(
      service.updateItemStopList('tenant-b', 'item-from-a', true),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.menuItem.update).not.toHaveBeenCalled();
    expect(cache.del).not.toHaveBeenCalled();
  });
});
