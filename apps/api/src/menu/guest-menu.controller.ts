import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { GuestSessionGuard } from '../guest-session/guest-session.guard';
import type { QrTokenRequest } from '../guest-session/guest-session.guard';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { MenuService } from './menu.service';

@Controller('guest/menu')
@SkipTenantGuard()
@UseGuards(GuestSessionGuard)
export class GuestMenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  getMenu(@Req() request: Request) {
    return this.menuService.getGuestMenu((request as QrTokenRequest).tenantId);
  }
}
