import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { MenuService } from './menu.service';

@Controller('guest/menu')
export class GuestMenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  getMenu(@Query('tenantId') tenantId?: string) {
    const tid = tenantId?.trim();
    if (!tid) {
      throw new BadRequestException('tenantId is required');
    }
    return this.menuService.getGuestMenu(tid);
  }
}
