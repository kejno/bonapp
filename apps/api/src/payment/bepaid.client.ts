import { Injectable, Logger } from '@nestjs/common';
import { PaymentConfigService } from '../config/payment-config.service';

export interface BepaidCheckoutResult {
  token: string;
  checkoutUrl: string;
}

@Injectable()
export class BepaidClient {
  private readonly logger = new Logger(BepaidClient.name);

  constructor(private readonly config: PaymentConfigService) {}

  async createCheckout(
    orderId: string,
    amount: number,
    currency: string,
  ): Promise<BepaidCheckoutResult> {
    const credentials = Buffer.from(
      `${this.config.bepaidPublicKey}:${this.config.bepaidSecretKey}`,
    ).toString('base64');

    const response = await fetch(
      `${this.config.bepaidApiUrl}/ctp/api/checkouts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${credentials}`,
        },
        body: JSON.stringify({
          checkout: {
            order: { id: orderId, amount, currency },
          },
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(
        `bePaid createCheckout failed: ${response.status} ${text}`,
      );
      throw new Error(`bePaid API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      checkout: { token: string; redirect_url: string };
    };
    return {
      token: data.checkout.token,
      checkoutUrl: data.checkout.redirect_url,
    };
  }

  async voidCheckout(token: string): Promise<boolean> {
    try {
      const credentials = Buffer.from(
        `${this.config.bepaidPublicKey}:${this.config.bepaidSecretKey}`,
      ).toString('base64');

      const response = await fetch(
        `${this.config.bepaidApiUrl}/ctp/api/checkouts/${token}/void`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${credentials}`,
          },
        },
      );
      return response.ok;
    } catch (err) {
      this.logger.warn(`bePaid voidCheckout failed: ${String(err)}`);
      return false;
    }
  }
}
