import { Injectable } from '@nestjs/common';

export type OplatiPaymentSession = {
  qrCodeData: string;
  deepLink: string;
  expiresAt: string;
};

@Injectable()
export class GuestPaymentsService {
  createOplatiPayment(orderId: string): OplatiPaymentSession {
    const deepLink = `oplati://pay/${encodeURIComponent(orderId)}`;

    return {
      qrCodeData: deepLink,
      deepLink,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }
}
