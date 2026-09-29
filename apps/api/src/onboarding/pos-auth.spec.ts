import { PosOrderRejectedError, requestIikoOrder, type PosJsonRequester } from './pos-network';

describe('requestIikoOrder', () => {
  it('exchanges the iiko credentials for an access token before submitting an order', async () => {
    const requests: Array<{ path: string; payload: unknown; token?: string }> = [];
    const requestJson: PosJsonRequester = jest.fn((_url, _allowedHosts, _timeoutMs, _method, path, payload, token) => {
      requests.push({ path, payload, token });
      return Promise.resolve(path === '/api/v2/access_token' ? { token: 'short-lived-access-token' } : { orderInfo: { id: 'iiko-order-91' } });
    });
    const payload = { organizationId: 'org-1', terminalGroupId: 'terminal-1', order: { items: [{ productId: 'dish-1', amount: 2 }] } };

    await expect(requestIikoOrder(
      new URL('https://api-ru.iiko.services'),
      { apiKey: 'tenant-api-key', appId: 'integration-app', clientSecret: 'integration-secret' },
      'api-ru.iiko.services',
      15000,
      payload,
      requestJson,
    )).resolves.toBe('iiko-order-91');

    expect(requests).toEqual([
      {
        path: '/api/v2/access_token',
        payload: { apiKey: 'tenant-api-key', appId: 'integration-app', clientSecret: 'integration-secret' },
        token: undefined,
      },
      { path: '/api/1/order/create', payload, token: 'short-lived-access-token' },
    ]);
  });

  it('does not submit an order when iiko does not return an access token', async () => {
    const requestJson: PosJsonRequester = jest.fn().mockResolvedValue({ error: 'invalid credentials' });

    await expect(requestIikoOrder(
      new URL('https://api-ru.iiko.services'),
      { apiKey: 'tenant-api-key', appId: 'integration-app', clientSecret: 'integration-secret' },
      'api-ru.iiko.services',
      15000,
      {},
      requestJson,
    )).rejects.toThrow('iiko не вернул маркер доступа');
    expect(requestJson).toHaveBeenCalledTimes(1);
  });

  it.each([400, 408, 409])('keeps an HTTP %i order response retry-blocking because acceptance is unknown', async (status) => {
    const requestJson: PosJsonRequester = jest.fn((_url, _allowedHosts, _timeoutMs, _method, path) => {
      if (path === '/api/v2/access_token') return Promise.resolve({ token: 'short-lived-access-token' });
      return Promise.reject(new PosOrderRejectedError(`POS вернул HTTP ${status}`));
    });

    const result = requestIikoOrder(
      new URL('https://api-ru.iiko.services'),
      { apiKey: 'tenant-api-key', appId: 'integration-app', clientSecret: 'integration-secret' },
      'api-ru.iiko.services',
      15000,
      {},
      requestJson,
    );

    await expect(result).rejects.toThrow(`POS вернул HTTP ${status}`);
    await expect(result).rejects.not.toBeInstanceOf(PosOrderRejectedError);
  });
});
