import { BadRequestException, Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
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

  @Post(':id/items')
  addOrderItem(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const guestRequest = request as QrTokenRequest;
    if (typeof body !== 'object' || body === null || typeof (body as Record<string, unknown>).itemId !== 'string') {
      throw new BadRequestException('itemId is required');
    }
    const { itemId, quantity } = body as { itemId: string; quantity?: number };
    const amount = quantity ?? 1;
    if (!Number.isInteger(amount) || amount < 1 || amount > 20) {
      throw new BadRequestException('quantity must be between 1 and 20');
    }
    return this.guestSessionService.addOrderItem(id, itemId, amount, guestRequest.tenantId, guestRequest.tableId);
  }
}
