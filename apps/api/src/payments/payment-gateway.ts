import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PaymentMethodName = 'ERIP' | 'BEPAID';

@Injectable()
export class PaymentGateway {
  constructor(private readonly config: ConfigService) {}

  async create(method: PaymentMethodName, input: { paymentId: string; tenantId: string; amount: number; orderId: string }): Promise<{ id: string; eripOrderNumber?: string; checkoutUrl?: string }> {
    const prefix = method === 'ERIP' ? 'ERIP' : 'BEPAID';
    const url = this.config.get<string>(`${prefix}_API_URL`);
    const key = this.config.get<string>(`${prefix}_API_KEY`);
    if (!url || !key) throw new ServiceUnavailableException(`${method} payment gateway is not configured`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'idempotency-key': input.paymentId },
      body: JSON.stringify({ orderId: input.orderId, paymentId: input.paymentId, tenantId: input.tenantId, amount: input.amount, currency: 'BYN' }),
    });
    if (!response.ok) throw new ServiceUnavailableException(`${method} payment gateway request failed`);
    const body = await response.json() as Record<string, unknown>;
    const externalId = body['id'] ?? body['transactionId'] ?? body['orderId'];
    if (typeof externalId !== 'string' && typeof externalId !== 'number') throw new ServiceUnavailableException(`${method} returned an invalid response`);
    if (method === 'ERIP' && typeof (body['eripOrderNumber'] ?? body['orderNumber']) !== 'string') throw new ServiceUnavailableException('ERIP returned no order number');
    if (method === 'BEPAID' && typeof (body['checkoutUrl'] ?? body['redirectUrl']) !== 'string') throw new ServiceUnavailableException('bePaid returned no checkout URL');
    return {
      id: String(externalId),
      ...(method === 'ERIP' ? { eripOrderNumber: String(body['eripOrderNumber'] ?? body['orderNumber']) } : { checkoutUrl: String(body['checkoutUrl'] ?? body['redirectUrl']) }),
    };
  }

  async cancel(method: PaymentMethodName, transactionId: string): Promise<boolean> {
    const prefix = method === 'ERIP' ? 'ERIP' : 'BEPAID';
    const url = this.config.get<string>(`${prefix}_CANCEL_API_URL`);
    const key = this.config.get<string>(`${prefix}_API_KEY`);
    if (!url || !key) return false;
    const response = await fetch(url.replace(':id', encodeURIComponent(transactionId)), { method: 'POST', headers: { authorization: `Bearer ${key}` } });
    return response.ok;
  }
}
