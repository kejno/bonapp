import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OplatiPaymentResult {
  externalId: string;
  qrCodeData: string;
  deepLink: string;
  eripCode: string | null;
}

@Injectable()
export class OplatiService {
  constructor(private readonly config: ConfigService) {}

  async createPayment(
    orderId: string,
    totalWithTipsByn: number,
  ): Promise<OplatiPaymentResult> {
    const baseUrl = this.config.getOrThrow('OPLATI_BASE_URL');
    const apiKey = this.config.getOrThrow('OPLATI_API_KEY');
    const callbackUrl = this.config.getOrThrow('OPLATI_CALLBACK_URL');

    const response = await fetch(`${baseUrl}/api/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        orderId,
        amount: totalWithTipsByn,
        currency: 'BYN',
        callbackUrl,
      }),
    });

    if (!response.ok) {
      throw new Error(`Oplati API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      paymentId: string;
      qrCodeData: string;
      deepLink: string;
      eripCode?: string;
    };

    return {
      externalId: data.paymentId,
      qrCodeData: data.qrCodeData,
      deepLink: data.deepLink,
      eripCode: data.eripCode ?? null,
    };
  }
}
