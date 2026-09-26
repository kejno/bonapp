import { GuestMenuController } from './guest-menu.controller';
import { MenuService } from './menu.service';

describe('GuestMenuController', () => {
  const menuService = { getGuestMenu: jest.fn() };
  const controller = new GuestMenuController(menuService as unknown as MenuService);

  beforeEach(() => jest.clearAllMocks());

  it('uses tenant scope established by the QR session guard', () => {
    void controller.getMenu({ tenantId: 'tenant-from-session' } as never);
    expect(menuService.getGuestMenu).toHaveBeenCalledWith('tenant-from-session');
  });
});
