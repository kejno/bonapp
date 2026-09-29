import { BadRequestException, Body, Controller, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { GuestSessionGuard, QrTokenRequest } from '../guest-session/guest-session.guard';
import { PaymentsService } from './payments.service';

@Controller('guest/orders/:orderId/pay')
@SkipTenantGuard()
@UseGuards(GuestSessionGuard)
export class GuestOrderPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('oplati')
  createOplatiPayment(@Req() req: Request, @Param('orderId') orderId: string, @Body() body: unknown) {
    const guest = req as QrTokenRequest;
    const value = body !== null && typeof body === 'object' ? (body as Record<string, unknown>)['tipsAmountByn'] : undefined;
    const tipsAmountByn = value === undefined ? 0 : Number(value);
    if (!Number.isFinite(tipsAmountByn) || tipsAmountByn < 0) throw new BadRequestException('Invalid tips amount');
    return this.payments.createOplatiPayment(guest.tenantId, guest.tableId, orderId, tipsAmountByn);
  }
}

@Controller('webhooks/oplati')
@SkipTenantGuard()
export class OplatiWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  receive(@Req() req: Request & { rawBody?: Buffer }, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.payments.acceptWebhook(req.rawBody, headers);
  }
}
