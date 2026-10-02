import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { BadRequestException, Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { GuestSessionGuard, QrTokenRequest } from './guest-session.guard';
import { GuestSessionService } from './guest-session.service';

@Controller('guest/orders')
@ApiTags('Гостевые операции')
@ApiSecurity('qr-token')
@SkipTenantGuard()
@UseGuards(GuestSessionGuard)
export class GuestOrdersController {
  constructor(private readonly guestSessionService: GuestSessionService) {}

  @ApiOperation({ summary: 'Создать или выполнить guest/orders' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Post()
  createOrder(@Req() request: Request, @Body() body: unknown) {
    const guestRequest = request as QrTokenRequest;
    if (typeof body !== 'object' || body === null) throw new BadRequestException('Order body is required');
    const input = body as Record<string, unknown>;
    if (typeof input['qrToken'] !== 'string' || input['qrToken'] !== request.headers['x-qr-token'] || typeof input['comment'] !== 'string' || !Array.isArray(input['items'])) {
      throw new BadRequestException('qrToken, items, and comment are required');
    }
    return this.guestSessionService.createGuestOrder(guestRequest.tenantId, guestRequest.tableId, {
      comment: input['comment'],
      guestSessionId: typeof input['guestSessionId'] === 'string' ? input['guestSessionId'] : null,
      items: input['items'] as Array<{ menuItemId: string; quantity: number; selectedModifiers: string[] }>,
    });
  }

  @ApiOperation({ summary: 'Получить guest/orders :id' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Get(':id')
  getOrderStatus(@Req() request: Request, @Param('id') id: string) {
    const guestRequest = request as QrTokenRequest;
    return this.guestSessionService.getOrderStatus(id, guestRequest.tenantId, guestRequest.tableId);
  }

  @ApiOperation({ summary: 'Создать или выполнить guest/orders :id/pay/card' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Post(':id/pay/card')
  createCardPayment(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const guestRequest = request as QrTokenRequest;
    let tipsAmountByn = 0;
    if (body !== undefined) {
      if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new BadRequestException('Некорректная сумма чаевых');
      const value = (body as Record<string, unknown>).tipsAmountByn;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BadRequestException('Некорректная сумма чаевых');
      }
      const amountInKopecks = new Prisma.Decimal(value).mul(100);
      if (amountInKopecks.isNegative() || !amountInKopecks.isInteger() || !Number.isSafeInteger(amountInKopecks.toNumber())) {
        throw new BadRequestException('Некорректная сумма чаевых');
      }
      tipsAmountByn = value;
    }
    return this.guestSessionService.createCardPayment(id, guestRequest.tenantId, guestRequest.tableId, tipsAmountByn);
  }

  @ApiOperation({ summary: 'Создать или выполнить guest/orders :id/pay/erip' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Post(':id/pay/erip')
  createEripPayment(@Req() request: Request, @Param('id') id: string) {
    const guestRequest = request as QrTokenRequest;
    return this.guestSessionService.createEripPayment(id, guestRequest.tenantId, guestRequest.tableId, request.ip ?? '0.0.0.0');
  }

  @ApiOperation({ summary: 'Получить guest/orders :id/pay/erip/status' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Get(':id/pay/erip/status')
  getEripPaymentStatus(@Req() request: Request, @Param('id') id: string) {
    const guestRequest = request as QrTokenRequest;
    return this.guestSessionService.getEripPaymentStatus(id, guestRequest.tenantId, guestRequest.tableId);
  }

  @ApiOperation({ summary: 'Получить guest/orders :id/pay/card/status' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Get(':id/pay/card/status')
  getCardPaymentStatus(@Req() request: Request, @Param('id') id: string) {
    const guestRequest = request as QrTokenRequest;
    return this.guestSessionService.getCardPaymentStatus(id, guestRequest.tenantId, guestRequest.tableId);
  }

  @ApiOperation({ summary: 'Создать или выполнить guest/orders :id/items' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
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
