import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  PaymentGateway,
  PaymentGatewayCredentials,
  PaymentOnboardingStatusResponse,
  SavePaymentOnboardingRequest,
} from '@bonapp/shared-types';
import { createCipheriv, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export const PAYMENT_CREDENTIALS_ENCRYPTION_KEY =
  'PAYMENT_CREDENTIALS_ENCRYPTION_KEY';

const gateways: PaymentGateway[] = [
  'OPLATI',
  'ERIP_EPOS',
  'BEPAY_WEBPAY',
  'SKNO_TITAN_PLUS',
];

@Injectable()
export class PaymentOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_CREDENTIALS_ENCRYPTION_KEY)
    private readonly encryptionKey: string,
  ) {}

  async save(
    tenantId: string,
    request: SavePaymentOnboardingRequest,
  ): Promise<void> {
    const seenGateways = new Set<PaymentGateway>();

    for (const credentials of request.gateways) {
      if (seenGateways.has(credentials.gateway)) {
        throw new BadRequestException(
          `Gateway ${credentials.gateway} was supplied more than once`,
        );
      }
      seenGateways.add(credentials.gateway);
      this.validate(credentials);

      await this.prisma.tenantPaymentSetting.upsert({
        where: { tenantId_gateway: { tenantId, gateway: credentials.gateway } },
        create: {
          tenantId,
          gateway: credentials.gateway,
          credentials: this.encrypt(credentials),
        },
        update: { credentials: this.encrypt(credentials) },
      });
    }
  }

  async getStatuses(
    tenantId: string,
  ): Promise<PaymentOnboardingStatusResponse> {
    const settings = await this.prisma.tenantPaymentSetting.findMany({
      where: { tenantId },
      select: { gateway: true },
    });
    const connectedGateways = new Set(settings.map(({ gateway }) => gateway));

    return {
      gateways: gateways.map((gateway) => ({
        gateway,
        connected: connectedGateways.has(gateway),
      })),
    };
  }

  private validate(credentials: PaymentGatewayCredentials): void {
    const requiredValues = this.requiredValues(credentials);

    if (
      requiredValues.some(
        (value) => typeof value !== 'string' || value.trim().length === 0,
      )
    ) {
      throw new BadRequestException(
        `Credentials for ${credentials.gateway} are incomplete`,
      );
    }
  }

  private requiredValues(credentials: PaymentGatewayCredentials): unknown[] {
    switch (credentials.gateway) {
      case 'OPLATI':
        return [credentials.merchantId];
      case 'ERIP_EPOS':
        return [credentials.serviceId, credentials.secret];
      case 'BEPAY_WEBPAY':
        return [
          credentials.provider,
          credentials.shopId,
          credentials.secret,
          credentials.environment,
        ];
      case 'SKNO_TITAN_PLUS':
        return [credentials.cashRegisterSerialNumber, credentials.unp];
    }
  }

  private encrypt(credentials: PaymentGatewayCredentials): string {
    const key = Buffer.from(this.encryptionKey, 'utf8');
    if (key.length !== 32) {
      throw new Error(
        'PAYMENT_CREDENTIALS_ENCRYPTION_KEY must be exactly 32 bytes',
      );
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(credentials), 'utf8'),
      cipher.final(),
    ]);
    return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
  }
}
