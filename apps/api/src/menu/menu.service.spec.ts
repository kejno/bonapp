import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MenuService } from './menu.service';

describe('MenuService', () => {
  const tenantId = 'tenant-1';
  const itemId = 'item-1';
  let prisma: any;
  let cache: { invalidateGuestMenu: jest.Mock };
  let notifier: { notifyStopListChanged: jest.Mock };
  let service: MenuService;

  beforeEach(() => {
    prisma = {
      menuItem: {
        findFirst: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      modifierGroup: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      modifierOption: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    cache = { invalidateGuestMenu: jest.fn().mockResolvedValue(undefined) };
    notifier = { notifyStopListChanged: jest.fn() };
    service = new MenuService(prisma, cache as any, notifier as any);
  });

  it('creates a group for an item owned by the tenant', async () => {
    prisma.menuItem.findFirst.mockResolvedValue({ id: itemId });
    prisma.modifierGroup.create.mockResolvedValue({
      id: 'group-1',
      name: 'Size',
    });

    await expect(
      service.createGroup(tenantId, itemId, {
        name: 'Size',
        min_selected: 1,
        max_selected: 1,
      }),
    ).resolves.toEqual({ id: 'group-1', name: 'Size' });
    expect(prisma.modifierGroup.create).toHaveBeenCalledWith({
      data: { itemId, name: 'Size', minSelected: 1, maxSelected: 1 },
      include: { options: { where: { isActive: true } } },
    });
  });

  it('rejects a group with invalid selection bounds', async () => {
    await expect(
      service.createGroup(tenantId, itemId, {
        name: 'Invalid',
        min_selected: 2,
        max_selected: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.menuItem.findFirst).not.toHaveBeenCalled();
  });

  it('does not allow more default options than the group maximum', async () => {
    prisma.modifierGroup.findFirst.mockResolvedValue({
      id: 'group-1',
      minSelected: 0,
      maxSelected: 1,
      options: [{ id: 'option-1', isDefault: true }],
    });

    await expect(
      service.createOption(tenantId, 'group-1', {
        name: 'Large',
        extra_price_byn: 2.5,
        is_default: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('soft-deletes only the selected option', async () => {
    prisma.modifierOption.findFirst.mockResolvedValue({ id: 'option-2' });
    prisma.modifierOption.update.mockResolvedValue({
      id: 'option-2',
      isActive: false,
    });

    await service.deleteOption(tenantId, 'option-2');

    expect(prisma.modifierOption.update).toHaveBeenCalledWith({
      where: { id: 'option-2' },
      data: { isActive: false },
    });
  });

  it('updates the stop-list, invalidates the tenant cache and notifies its guests', async () => {
    prisma.menuItem.findFirst.mockResolvedValue({ id: itemId });
    prisma.menuItem.update.mockResolvedValue({
      id: itemId,
      isInStopList: true,
    });

    await expect(
      service.updateStopList(tenantId, itemId, true),
    ).resolves.toEqual({
      id: itemId,
      isInStopList: true,
    });
    expect(cache.invalidateGuestMenu).toHaveBeenCalledWith(tenantId);
    expect(notifier.notifyStopListChanged).toHaveBeenCalledWith(tenantId, {
      itemId,
      isInStopList: true,
    });
  });

  it('does not expose an item from another tenant', async () => {
    prisma.menuItem.findFirst.mockResolvedValue(null);

    await expect(
      service.updateStopList(tenantId, itemId, false),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
