import { ConfigService } from '@nestjs/config';
import { PaymentGateway } from './payment-gateway';

describe('BNP-528 bePaid payment gateway', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns the provider checkout URL', async () => {
    const config = { get: (key: string) => ({ BEPAID_API_URL: 'https://bepaid.example/pay', BEPAID_API_KEY: 'test-key' })[key] } as ConfigService;
    const gateway = new PaymentGateway(config);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'txn-1', checkoutUrl: 'https://checkout.example/session' }), { status: 200 }));

    await expect(gateway.create('BEPAID', { paymentId: 'p1', tenantId: 't1', amount: 25, orderId: 'o1' }))
      .resolves.toEqual({ id: 'txn-1', checkoutUrl: 'https://checkout.example/session' });
  });
});
