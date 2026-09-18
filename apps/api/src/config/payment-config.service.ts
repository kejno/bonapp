import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PaymentConfigService {
  constructor(private readonly config: ConfigService) {}

  get eripApiUrl(): string {
    return this.config.getOrThrow<string>('ERIP_API_URL');
  }

  get eripApiKey(): string {
    return this.config.getOrThrow<string>('ERIP_API_KEY');
  }

  get eripMerchantId(): string {
    return this.config.getOrThrow<string>('ERIP_MERCHANT_ID');
  }

  get eripWebhookSecret(): string {
    return this.config.getOrThrow<string>('ERIP_WEBHOOK_SECRET');
  }

  get bepaidApiUrl(): string {
    return this.config.getOrThrow<string>('BEPAID_API_URL');
  }

  get bepaidPublicKey(): string {
    return this.config.getOrThrow<string>('BEPAID_PUBLIC_KEY');
  }

  get bepaidSecretKey(): string {
    return this.config.getOrThrow<string>('BEPAID_SECRET_KEY');
  }

  get bepaidWebhookSecret(): string {
    return this.config.getOrThrow<string>('BEPAID_WEBHOOK_SECRET');
  }
}
