import { Injectable, Logger } from '@nestjs/common';
import { PaymentConfigService } from '../config/payment-config.service';

export interface EripOrderResult {
  eripOrderNumber: string;
}

@Injectable()
export class EripClient {
  private readonly logger = new Logger(EripClient.name);

  constructor(private readonly config: PaymentConfigService) {}

  async createOrder(
    orderId: string,
    amount: number,
    currency: string,
  ): Promise<EripOrderResult> {
    const response = await fetch(`${this.config.eripApiUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.config.eripApiKey,
      },
      body: JSON.stringify({
        merchantId: this.config.eripMerchantId,
        orderId,
        amount,
        currency,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`ERIP createOrder failed: ${response.status} ${text}`);
      throw new Error(`ERIP API error: ${response.status}`);
    }

    const data = (await response.json()) as { erip_order_number: string };
    return { eripOrderNumber: data.erip_order_number };
  }

  async cancelOrder(eripOrderNumber: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.config.eripApiUrl}/payments/${eripOrderNumber}/cancel`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': this.config.eripApiKey,
          },
        },
      );
      return response.ok;
    } catch (err) {
      this.logger.warn(`ERIP cancelOrder failed: ${String(err)}`);
      return false;
    }
  }
}
