import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { GuestSessionGuard } from '../guest-session/guest-session.guard';
import type { QrTokenRequest } from '../guest-session/guest-session.guard';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { MenuService } from './menu.service';

@Controller('guest/menu')
@ApiTags('Гостевые операции')
@ApiSecurity('qr-token')
@SkipTenantGuard()
@UseGuards(GuestSessionGuard)
export class GuestMenuController {
  constructor(private readonly menuService: MenuService) {}

  @ApiOperation({ summary: 'Получить guest/menu' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Get()
  getMenu(@Req() request: Request) {
    return this.menuService.getGuestMenu((request as QrTokenRequest).tenantId);
  }
}
