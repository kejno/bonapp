import { Controller, Headers, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { PaymentsService } from './payments.service';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Controller('webhooks')
@SkipTenantGuard()
export class WebhooksController {
  constructor(private readonly payments: PaymentsService, private readonly config: ConfigService) {}

  @Post('erip') erip(@Req() request: Request, @Headers('x-erip-signature') signature?: string) { return this.accept('ERIP', request, signature); }
  @Post('bepaid') bepaid(@Req() request: Request, @Headers('x-signature') signature?: string) { return this.accept('BEPAID', request, signature); }

  private async accept(method: 'ERIP' | 'BEPAID', request: Request, signature?: string) {
    const secret = this.config.get<string>(method === 'ERIP' ? 'ERIP_WEBHOOK_SECRET' : 'BEPAID_WEBHOOK_SECRET');
    const body = request.body as unknown;
    if (!secret || !signature || typeof body !== 'object' || body === null) throw new UnauthorizedException('Invalid webhook signature');
    const rawBody = (request as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) throw new UnauthorizedException('Invalid webhook signature');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const actual = signature.replace(/^sha256=/, '');
    if (!/^[a-f0-9]{64}$/i.test(actual) || !timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))) throw new UnauthorizedException('Invalid webhook signature');
    await this.payments.enqueue(method, body as Record<string, unknown>);
    return { accepted: true };
  }
}
