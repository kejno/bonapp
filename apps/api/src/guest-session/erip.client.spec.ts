import { EripClient } from './erip.client';

describe('EripClient', () => {
  const client = new EripClient();
  const originalFetch = global.fetch;
  const previousApiUrl = process.env.API_PUBLIC_URL;
  afterEach(() => {
    global.fetch = originalFetch;
    if (previousApiUrl === undefined) delete process.env.API_PUBLIC_URL;
    else process.env.API_PUBLIC_URL = previousApiUrl;
    jest.restoreAllMocks();
  });

  it('creates a bePaid ERIP request and returns the guest E-POS data', async () => {
    process.env.API_PUBLIC_URL = 'https://api.example';
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ transaction: { uid: 'uid-1', status: 'pending', erip: { account_number: '000000000042', service_no: 12345678, instruction: ['Каталог'], qr_code: 'png-base64' } } }) });
    global.fetch = fetchMock;

    const result = await client.create({ shopId: 'shop', secret: 'secret', serviceId: '12345678', amount: 1250, orderId: 'order-1', paymentId: 'payment-1', tenantId: 'tenant-1', ip: '203.0.113.10', dailyOrderNumber: 42 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const request = JSON.parse(init.body as string) as { request: Record<string, unknown> };

    expect(url).toBe('https://api.bepaid.by/beyag/payments');
    expect(new Headers(init.headers).get('Authorization')).toBe(`Basic ${Buffer.from('shop:secret').toString('base64')}`);
    expect(request.request).toMatchObject({ amount: 1250, currency: 'BYN', tracking_id: 'payment-1', order_id: '000000000042', notification_url: 'https://api.example/api/v1/webhooks/erip/tenant-1', payment_method: { type: 'erip', account_number: '000000000042', service_no: 12345678 } });
    expect(result).toMatchObject({ uid: 'uid-1', accountNumber: '000000000042', serviceNo: 12345678, qrCode: 'png-base64' });
  });
});
