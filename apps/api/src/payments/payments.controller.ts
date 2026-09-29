import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { GuestSessionGuard, QrTokenRequest } from '../guest-session/guest-session.guard';
import { PaymentsService } from './payments.service';

@Controller('guest/orders/:orderId/pay')
@SkipTenantGuard()
@UseGuards(GuestSessionGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}
  @Post('erip') erip(@Req() request: Request, @Param('orderId') orderId: string) {
    const guest = request as QrTokenRequest;
    return this.payments.initiate(orderId, guest.tenantId, guest.tableId, 'ERIP');
  }
  @Post('bepaid') bepaid(@Req() request: Request, @Param('orderId') orderId: string) {
    const guest = request as QrTokenRequest;
    return this.payments.initiate(orderId, guest.tenantId, guest.tableId, 'BEPAID');
  }
}
