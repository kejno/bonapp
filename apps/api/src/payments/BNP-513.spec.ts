import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentGateway } from './payment-gateway';

describe('BNP-513 payment gateway failures', () => {
  afterEach(() => jest.restoreAllMocks());

  it('rejects a checkout when the provider request fails', async () => {
    const config = { get: (key: string) => ({ BEPAID_API_URL: 'https://bepaid.example/pay', BEPAID_API_KEY: 'test-key' })[key] } as ConfigService;
    const gateway = new PaymentGateway(config);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));

    await expect(gateway.create('BEPAID', { paymentId: 'p1', tenantId: 't1', amount: 10, orderId: 'o1' }))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
