import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { GuestSessionGuard, QrTokenRequest } from './guest-session.guard';
import { GuestSessionService } from './guest-session.service';

@Controller('guest/orders')
@SkipTenantGuard()
@UseGuards(GuestSessionGuard)
export class GuestOrdersController {
  constructor(private readonly guestSessionService: GuestSessionService) {}

  @Get(':id')
  getOrderStatus(@Req() request: Request, @Param('id') id: string) {
    const guestRequest = request as QrTokenRequest;
    return this.guestSessionService.getOrderStatus(id, guestRequest.tenantId, guestRequest.tableId);
  }
}
