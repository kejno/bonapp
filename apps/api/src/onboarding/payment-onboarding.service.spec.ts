import { BadRequestException } from '@nestjs/common';
import { PaymentOnboardingService } from './payment-onboarding.service';

const encryptionKey = '0123456789abcdef0123456789abcdef';

describe('PaymentOnboardingService', () => {
  const prisma = {
    tenantPaymentSetting: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
  };
  let service: PaymentOnboardingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PaymentOnboardingService(prisma as never, encryptionKey);
  });

  it('encrypts credentials before persisting them and never returns them while reading statuses', async () => {
    prisma.tenantPaymentSetting.upsert.mockResolvedValue({});
    prisma.tenantPaymentSetting.findMany.mockResolvedValue([
      { gateway: 'OPLATI', credentials: 'encrypted-value' },
      { gateway: 'BEPAY_WEBPAY', credentials: 'another-encrypted-value' },
    ]);

    await service.save('tenant-1', {
      gateways: [
        { gateway: 'OPLATI', merchantId: 'merchant-42' },
        {
          gateway: 'BEPAY_WEBPAY',
          provider: 'bepaid',
          shopId: 'shop-10',
          secret: 'top-secret',
          environment: 'TEST',
        },
      ],
    });

    expect(prisma.tenantPaymentSetting.upsert).toHaveBeenCalledTimes(2);
    expect(
      prisma.tenantPaymentSetting.upsert.mock.calls[0][0].create.credentials,
    ).not.toContain('merchant-42');
    expect(
      prisma.tenantPaymentSetting.upsert.mock.calls[1][0].create.credentials,
    ).not.toContain('top-secret');
    await expect(service.getStatuses('tenant-1')).resolves.toEqual({
      gateways: [
        { gateway: 'OPLATI', connected: true },
        { gateway: 'ERIP_EPOS', connected: false },
        { gateway: 'BEPAY_WEBPAY', connected: true },
        { gateway: 'SKNO_TITAN_PLUS', connected: false },
      ],
    });
  });

  it('rejects incomplete gateway credentials', async () => {
    await expect(
      service.save('tenant-1', {
        gateways: [{ gateway: 'ERIP_EPOS', serviceId: 'service-id' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tenantPaymentSetting.upsert).not.toHaveBeenCalled();
  });

  it('stores only the selected bePaid or Webpay provider', async () => {
    prisma.tenantPaymentSetting.upsert.mockResolvedValue({});

    await service.save('tenant-1', {
      gateways: [
        {
          gateway: 'BEPAY_WEBPAY',
          provider: 'webpay',
          shopId: 'shop-10',
          secret: 'top-secret',
          environment: 'PROD',
        },
      ],
    });

    const encryptedCredentials =
      prisma.tenantPaymentSetting.upsert.mock.calls[0][0].create.credentials;
    expect(encryptedCredentials).not.toContain('webpay');
    expect(encryptedCredentials).not.toContain('top-secret');
  });
});
