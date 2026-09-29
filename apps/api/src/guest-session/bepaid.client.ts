import { Injectable, BadGatewayException } from '@nestjs/common';

interface CheckoutResponse {
  checkout?: { token?: string; redirect_url?: string };
  errors?: unknown;
}

interface CheckoutStatusResponse {
  checkout?: { status?: string; expired?: boolean };
}

@Injectable()
export class BepaidClient {
  async getCheckoutStatus(token: string): Promise<{ status: string; expired: boolean }> {
    let response: Response;
    try {
      response = await fetch(`https://checkout.bepaid.by/ctp/api/checkouts/${encodeURIComponent(token)}`, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: 'application/json', 'X-API-Version': '2' },
      });
    } catch {
      throw new BadGatewayException('Не удалось проверить статус платежа');
    }
    const data = await response.json().catch(() => ({})) as CheckoutStatusResponse;
    const status = data.checkout?.status;
    if (!response.ok || typeof status !== 'string') throw new BadGatewayException('Не удалось проверить статус платежа');
    return { status, expired: data.checkout?.expired === true };
  }

  async createCheckout(input: {
    shopId: string;
    secret: string;
    amount: number;
    paymentId: string;
    orderId: string;
    tenantId: string;
    test: boolean;
  }): Promise<{ token: string; redirectUrl: string }> {
    const guestUrl = process.env.GUEST_WEB_URL;
    const apiUrl = process.env.API_PUBLIC_URL;
    if (!guestUrl || !apiUrl) throw new BadGatewayException('Оплата временно недоступна');
    let response: Response;
    try {
      response = await fetch('https://checkout.bepaid.by/ctp/api/checkouts', {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Basic ${Buffer.from(`${input.shopId}:${input.secret}`).toString('base64')}`,
          'Content-Type': 'application/json', Accept: 'application/json', 'X-API-Version': '2',
        },
        body: JSON.stringify({ checkout: {
          transaction_type: 'payment', test: input.test,
          order: { amount: input.amount, currency: 'BYN', description: `Заказ ${input.orderId}`, tracking_id: input.paymentId, expired_at: new Date(Date.now() + 15 * 60_000).toISOString() },
          settings: {
            success_url: `${guestUrl}/order/${encodeURIComponent(input.orderId)}/pay?result=success`,
            decline_url: `${guestUrl}/order/${encodeURIComponent(input.orderId)}/pay?result=decline`,
            fail_url: `${guestUrl}/order/${encodeURIComponent(input.orderId)}/pay?result=fail`,
            cancel_url: `${guestUrl}/order/${encodeURIComponent(input.orderId)}/pay?result=cancel`,
            notification_url: `${apiUrl}/api/v1/webhooks/bepaid/${encodeURIComponent(input.tenantId)}`, language: 'ru',
          },
        } }),
      });
    } catch {
      throw new BadGatewayException('Платёжный сервис временно недоступен');
    }
    const data = await response.json().catch(() => ({})) as CheckoutResponse;
    const token = data.checkout?.token;
    const redirectUrl = data.checkout?.redirect_url;
    if (!response.ok || data.errors || !token || !redirectUrl) throw new BadGatewayException('Не удалось создать платёж. Попробуйте ещё раз');
    return { token, redirectUrl };
  }
}
