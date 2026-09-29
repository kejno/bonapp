import { ConfigService } from '@nestjs/config';
import { PaymentGateway } from './payment-gateway';

describe('BNP-527 ERIP payment gateway', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns the E-POS order number from the provider response', async () => {
    const config = { get: (key: string) => ({ ERIP_API_URL: 'https://erip.example/pay', ERIP_API_KEY: 'test-key' })[key] } as ConfigService;
    const gateway = new PaymentGateway(config);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'txn-1', eripOrderNumber: '123456' }), { status: 200 }));

    await expect(gateway.create('ERIP', { paymentId: 'p1', tenantId: 't1', amount: 25, orderId: 'o1' }))
      .resolves.toEqual({ id: 'txn-1', eripOrderNumber: '123456' });
  });
});
