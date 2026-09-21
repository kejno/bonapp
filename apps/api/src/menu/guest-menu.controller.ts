import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { MenuService } from './menu.service';

@Controller('api/v1/guest/menu')
export class GuestMenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  getMenu(@Query('tenantId') tenantId?: string) {
    if (!tenantId?.trim()) {
      throw new BadRequestException('tenantId is required');
    }
    return this.menuService.getGuestMenu(tenantId);
  }
}
