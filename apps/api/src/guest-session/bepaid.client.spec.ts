import { BepaidClient } from './bepaid.client';

describe('BepaidClient getCheckoutStatus', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reads status and expiration from the documented top-level response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      status: 'expired',
      expired: true,
      checkout: { token: 'checkout-token' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(new BepaidClient().getCheckoutStatus('checkout-token'))
      .resolves.toEqual({ status: 'expired', expired: true });
  });
});
