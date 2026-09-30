import { Injectable, BadGatewayException } from '@nestjs/common';

interface EripTransaction {
  uid?: string;
  status?: string;
  erip?: { account_number?: string; service_no?: number; instruction?: string[]; qr_code?: string; banks?: unknown[] };
}

@Injectable()
export class EripClient {
  private readonly baseUrl = 'https://api.bepaid.by/beyag/payments';

  async create(input: { shopId: string; secret: string; serviceId: string; amount: number; orderId: string; paymentId: string; tenantId: string; ip: string; dailyOrderNumber: number; restaurantName?: string }) {
    const apiUrl = process.env.API_PUBLIC_URL;
    const serviceNo = Number(input.serviceId);
    if (!apiUrl || !Number.isSafeInteger(serviceNo) || serviceNo < 1) throw new BadGatewayException('Реквизиты ЕРИП настроены некорректно');
    const accountNumber = String(input.dailyOrderNumber).padStart(12, '0');
    const response = await this.request(this.baseUrl, input.shopId, input.secret, {
      method: 'POST',
      body: JSON.stringify({ request: {
        amount: input.amount, currency: 'BYN', description: `Заказ №${input.dailyOrderNumber}`, ip: input.ip,
        tracking_id: input.paymentId, order_id: accountNumber,
        notification_url: `${apiUrl}/api/v1/webhooks/erip/${encodeURIComponent(input.tenantId)}`,
        expired_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        payment_method: { type: 'erip', account_number: accountNumber, service_no: serviceNo, service_info: [`Заказ №${input.dailyOrderNumber}`, ...(input.restaurantName ? [input.restaurantName] : [])], receipt: ['Спасибо за заказ'] },
      } }),
    });
    const tx = (await response.json().catch(() => ({})) as { transaction?: EripTransaction }).transaction;
    if (!response.ok || !tx?.uid || !tx.erip?.account_number || typeof tx.erip.service_no !== 'number') throw new BadGatewayException('Не удалось создать запрос ЕРИП. Попробуйте ещё раз');
    return {
      uid: tx.uid,
      accountNumber: tx.erip.account_number,
      serviceNo: tx.erip.service_no,
      instruction: Array.isArray(tx.erip.instruction) ? tx.erip.instruction.filter((step): step is string => typeof step === 'string') : [],
      qrCode: typeof tx.erip.qr_code === 'string' ? tx.erip.qr_code : null,
      banks: Array.isArray(tx.erip.banks) ? tx.erip.banks : [],
      transaction: tx,
    };
  }

  async get(uid: string, shopId: string, secret: string): Promise<EripTransaction> {
    const response = await this.request(`${this.baseUrl}/${encodeURIComponent(uid)}`, shopId, secret);
    const tx = (await response.json().catch(() => ({})) as { transaction?: EripTransaction }).transaction;
    if (!response.ok || !tx) throw new BadGatewayException('Не удалось проверить статус платежа');
    return tx;
  }

  async cancel(uid: string, shopId: string, secret: string) {
    const response = await this.request(`${this.baseUrl}/${encodeURIComponent(uid)}`, shopId, secret, { method: 'DELETE' });
    return response.ok;
  }

  private async request(url: string, shopId: string, secret: string, init: RequestInit = {}) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(10_000), headers: {
        Authorization: `Basic ${Buffer.from(`${shopId}:${secret}`).toString('base64')}`,
        Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers,
      } });
    } catch { throw new BadGatewayException('Платёжный сервис временно недоступен'); }
  }
}
