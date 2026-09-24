import { BadRequestException } from '@nestjs/common';
import type { TenantRequest } from '../auth/tenant-context.guard';
import { MenuAdminController } from './menu-admin.controller';
import { MenuAdminService } from './menu-admin.service';
import { MenuGateway } from './menu.gateway';

describe('MenuAdminController', () => {
  const menuAdminService: jest.Mocked<
    Pick<
      MenuAdminService,
      | 'listModifierGroups'
      | 'createModifierGroup'
      | 'updateModifierGroup'
      | 'deactivateModifierGroup'
      | 'createModifierOption'
      | 'updateModifierOption'
      | 'deactivateModifierOption'
      | 'updateItemStopList'
    >
  > = {
    listModifierGroups: jest.fn(),
    createModifierGroup: jest.fn(),
    updateModifierGroup: jest.fn(),
    deactivateModifierGroup: jest.fn(),
    createModifierOption: jest.fn(),
    updateModifierOption: jest.fn(),
    deactivateModifierOption: jest.fn(),
    updateItemStopList: jest.fn(),
  };

  const menuGateway: jest.Mocked<Pick<MenuGateway, 'emitStopListChanged'>> = {
    emitStopListChanged: jest.fn(),
  };

  const controller = new MenuAdminController(
    menuAdminService as unknown as MenuAdminService,
    menuGateway as unknown as MenuGateway,
  );

  const req = { user: { tenantId: 'tenant-1' } } as TenantRequest;

  beforeEach(() => jest.clearAllMocks());

  // --- modifier groups ---

  it('lists modifier groups for the authenticated tenant', async () => {
    menuAdminService.listModifierGroups.mockResolvedValue([]);
    await controller.listModifierGroups(req, 'item-1');
    expect(menuAdminService.listModifierGroups).toHaveBeenCalledWith('tenant-1', 'item-1');
  });

  it('trims itemId before listing modifier groups', async () => {
    menuAdminService.listModifierGroups.mockResolvedValue([]);
    await controller.listModifierGroups(req, '  item-1  ');
    expect(menuAdminService.listModifierGroups).toHaveBeenCalledWith('tenant-1', 'item-1');
  });

  it('creates a modifier group with all fields', async () => {
    menuAdminService.createModifierGroup.mockResolvedValue({ id: 'group-1' } as never);
    await controller.createModifierGroup(req, 'item-1', {
      name: 'Size',
      minSelected: 1,
      maxSelected: 1,
    });
    expect(menuAdminService.createModifierGroup).toHaveBeenCalledWith(
      'tenant-1',
      'item-1',
      { name: 'Size', minSelected: 1, maxSelected: 1 },
    );
  });

  it('creates a modifier group with name only (optional fields omitted)', async () => {
    menuAdminService.createModifierGroup.mockResolvedValue({ id: 'group-1' } as never);
    await controller.createModifierGroup(req, 'item-1', { name: 'Extras' });
    expect(menuAdminService.createModifierGroup).toHaveBeenCalledWith(
      'tenant-1',
      'item-1',
      { name: 'Extras', minSelected: undefined, maxSelected: undefined },
    );
  });

  it.each([
    {},
    { name: '' },
    { name: 123 },
  ])('rejects invalid create-group body %p', (body) => {
    expect(() => controller.createModifierGroup(req, 'item-1', body)).toThrow(BadRequestException);
  });

  it('updates a modifier group mapping minSelected to minSelection', async () => {
    menuAdminService.updateModifierGroup.mockResolvedValue({ id: 'group-1' } as never);
    await controller.updateModifierGroup(req, 'group-1', { name: 'Новый', minSelected: 0, maxSelected: 3 });
    expect(menuAdminService.updateModifierGroup).toHaveBeenCalledWith(
      'tenant-1',
      'group-1',
      { name: 'Новый', minSelection: 0, maxSelection: 3 },
    );
  });

  it.each([
    {},
    { name: '' },
    { minSelected: 'one' },
    { maxSelected: 'two' },
  ])('rejects invalid update-group body %p', (body) => {
    expect(() => controller.updateModifierGroup(req, 'group-1', body)).toThrow(BadRequestException);
  });

  it('deactivates a modifier group for the authenticated tenant', async () => {
    menuAdminService.deactivateModifierGroup.mockResolvedValue({ id: 'group-1' } as never);
    await controller.deactivateModifierGroup(req, 'group-1');
    expect(menuAdminService.deactivateModifierGroup).toHaveBeenCalledWith('tenant-1', 'group-1');
  });

  // --- modifier options ---

  it('creates a modifier option with all fields', async () => {
    menuAdminService.createModifierOption.mockResolvedValue({ id: 'opt-1' } as never);
    await controller.createModifierOption(req, 'group-1', {
      name: 'Large',
      extraPriceByn: 1.5,
      isDefault: true,
    });
    expect(menuAdminService.createModifierOption).toHaveBeenCalledWith(
      'tenant-1',
      'group-1',
      { name: 'Large', extraPriceByn: 1.5, isDefault: true },
    );
  });

  it('creates a modifier option with name only (optional fields omitted)', async () => {
    menuAdminService.createModifierOption.mockResolvedValue({ id: 'opt-1' } as never);
    await controller.createModifierOption(req, 'group-1', { name: 'Small' });
    expect(menuAdminService.createModifierOption).toHaveBeenCalledWith(
      'tenant-1',
      'group-1',
      { name: 'Small', extraPriceByn: undefined, isDefault: undefined },
    );
  });

  it.each([{}, { name: '' }, { name: 42 }])('rejects invalid create-option body %p', (body) => {
    expect(() => controller.createModifierOption(req, 'group-1', body)).toThrow(BadRequestException);
  });

  it('updates a modifier option with all fields', async () => {
    menuAdminService.updateModifierOption.mockResolvedValue({ id: 'opt-1' } as never);
    await controller.updateModifierOption(req, 'opt-1', {
      name: 'XL',
      extraPriceByn: 2.0,
      isDefault: false,
    });
    expect(menuAdminService.updateModifierOption).toHaveBeenCalledWith(
      'tenant-1',
      'opt-1',
      { name: 'XL', extraPriceByn: 2.0, isDefault: false },
    );
  });

  it('updates a modifier option with a single field', async () => {
    menuAdminService.updateModifierOption.mockResolvedValue({ id: 'opt-1' } as never);
    await controller.updateModifierOption(req, 'opt-1', { extraPriceByn: 0.5 });
    expect(menuAdminService.updateModifierOption).toHaveBeenCalledWith(
      'tenant-1',
      'opt-1',
      { extraPriceByn: 0.5 },
    );
  });

  it.each([
    {},
    { name: '' },
    { extraPriceByn: 'free' },
    { isDefault: 'yes' },
  ])('rejects invalid update-option body %p', (body) => {
    expect(() => controller.updateModifierOption(req, 'opt-1', body)).toThrow(BadRequestException);
  });

  it('deactivates a modifier option for the authenticated tenant', async () => {
    menuAdminService.deactivateModifierOption.mockResolvedValue({ id: 'opt-1' } as never);
    await controller.deactivateModifierOption(req, 'opt-1');
    expect(menuAdminService.deactivateModifierOption).toHaveBeenCalledWith('tenant-1', 'opt-1');
  });

  // --- stop list ---

  it('updates the stop list and emits the WebSocket event', async () => {
    menuAdminService.updateItemStopList.mockResolvedValue({ id: 'item-1' } as never);
    await controller.updateItemStopList(req, 'item-1', { isInStopList: true });

    expect(menuAdminService.updateItemStopList).toHaveBeenCalledWith(
      'tenant-1',
      'item-1',
      true,
    );
    expect(menuGateway.emitStopListChanged).toHaveBeenCalledWith('tenant-1', 'item-1', true);
  });

  it('emits isInStopList false when removing from stop list', async () => {
    menuAdminService.updateItemStopList.mockResolvedValue({ id: 'item-1' } as never);
    await controller.updateItemStopList(req, 'item-1', { isInStopList: false });
    expect(menuGateway.emitStopListChanged).toHaveBeenCalledWith('tenant-1', 'item-1', false);
  });

  it('uses the tenant from the authenticated request for the stop list', async () => {
    menuAdminService.updateItemStopList.mockResolvedValue({ id: 'item-1' } as never);
    await controller.updateItemStopList(
      { user: { tenantId: 'trusted' } } as TenantRequest,
      'item-1',
      { isInStopList: true, tenantId: 'untrusted' },
    );
    expect(menuAdminService.updateItemStopList).toHaveBeenCalledWith('trusted', 'item-1', true);
  });

  it.each([
    {},
    { isInStopList: 'true' },
    { isInStopList: 1 },
  ])('rejects invalid stop-list body %p', async (body) => {
    await expect(controller.updateItemStopList(req, 'item-1', body)).rejects.toThrow(
      BadRequestException,
    );
  });
});
