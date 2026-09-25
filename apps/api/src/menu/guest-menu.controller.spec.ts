import { BadRequestException } from '@nestjs/common';
import { GuestMenuController } from './guest-menu.controller';
import { MenuService } from './menu.service';

describe('GuestMenuController', () => {
  const menuService = { getGuestMenu: jest.fn() };
  const controller = new GuestMenuController(menuService as unknown as MenuService);

  beforeEach(() => jest.clearAllMocks());

  it.each([undefined, '', '   '])(
    'rejects a missing or blank tenantId (%p)',
    (tenantId) => {
      expect(() => controller.getMenu(tenantId)).toThrow(
        BadRequestException,
      );
      expect(menuService.getGuestMenu).not.toHaveBeenCalled();
    },
  );

  it('trims whitespace from tenantId before calling the service', () => {
    void controller.getMenu('  abc-tenant  ');
    expect(menuService.getGuestMenu).toHaveBeenCalledWith('abc-tenant');
  });
});
