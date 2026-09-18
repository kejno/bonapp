import { Controller, Get, Headers, Param } from '@nestjs/common';
import { GuestMenuService } from './guest-menu.service';

@Controller('api/v1/guest')
export class GuestMenuController {
  constructor(private readonly guestMenuService: GuestMenuService) {}

  @Get('menu')
  getMenu(@Headers('x-table-session-token') token?: string) {
    return this.guestMenuService.getMenu(token ?? '');
  }

  @Get('t/:token/menu')
  getMenuByQrToken(@Param('token') token: string) {
    return this.guestMenuService.getMenu(token);
  }
}
