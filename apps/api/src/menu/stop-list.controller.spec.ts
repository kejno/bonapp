import { BadRequestException } from '@nestjs/common';
import type { TenantRequest } from '../auth/tenant-context.guard';
import { MenuAdminService } from './menu-admin.service';
import { StopListController } from './stop-list.controller';

describe('StopListController', () => {
  const menuAdminService = { updateStopList: jest.fn() };
  const controller = new StopListController(
    menuAdminService as unknown as MenuAdminService,
  );
  const request = { user: { tenantId: 'trusted-tenant' } } as TenantRequest;

  beforeEach(() => jest.clearAllMocks());

  it('uses the tenant from the authenticated request instead of the body', async () => {
    await controller.update(request, {
      tenantId: 'untrusted-tenant',
      itemId: 'item-1',
      isStopped: true,
    });

    expect(menuAdminService.updateStopList).toHaveBeenCalledWith(
      'trusted-tenant',
      'item-1',
      true,
    );
  });

  it('trims the item identifier before sending it to the service', async () => {
    await controller.update(request, {
      itemId: '  item-1  ',
      isStopped: true,
    });

    expect(menuAdminService.updateStopList).toHaveBeenCalledWith(
      'trusted-tenant',
      'item-1',
      true,
    );
  });

  it.each([
    { itemId: '', isStopped: true },
    { itemId: 'item-1', isStopped: 'true' },
    { itemId: 'item-1' },
  ])('rejects invalid stop-list payload %p', (body) => {
    expect(() => controller.update(request, body)).toThrow(BadRequestException);
    expect(menuAdminService.updateStopList).not.toHaveBeenCalled();
  });
});
