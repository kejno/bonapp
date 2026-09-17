import { RKeeperClient } from './rkeeper.client';

describe('RKeeperClient', () => {
  const config = { baseUrl: 'http://rk.test', username: 'u', password: 'p' };
  let client: RKeeperClient;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    client = new RKeeperClient(config);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getCategories', () => {
    it('returns categories and sends Basic Auth header', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { id: 'c1', name: 'Pizza' },
            { id: 'c2', name: 'Drinks' },
          ],
        }),
      } as Response);

      const result = await client.getCategories();

      expect(result).toEqual([
        { id: 'c1', name: 'Pizza' },
        { id: 'c2', name: 'Drinks' },
      ]);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://rk.test/api/v1/entities/productCategories',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Basic /),
          }),
        }),
      );
    });

    it('throws on non-OK response', async () => {
      fetchSpy.mockResolvedValueOnce({ ok: false, status: 401 } as Response);
      await expect(client.getCategories()).rejects.toThrow('r_keeper API error: 401');
    });
  });

  describe('getProducts', () => {
    it('returns products from r_keeper', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { id: 'p1', name: 'Margherita', price: 10.5, categoryId: 'c1' },
            { id: 'p2', name: 'Cola', price: 2.0 },
          ],
        }),
      } as Response);

      const result = await client.getProducts();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 'p1', name: 'Margherita', price: 10.5, categoryId: 'c1' });
      expect(result[1]).toEqual({ id: 'p2', name: 'Cola', price: 2.0 });
    });

    it('throws on non-OK response', async () => {
      fetchSpy.mockResolvedValueOnce({ ok: false, status: 500 } as Response);
      await expect(client.getProducts()).rejects.toThrow('r_keeper API error: 500');
    });
  });

  describe('createOrder', () => {
    it('sends order payload with correct headers and returns r_keeper order ID', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'rk-999' }),
      } as Response);

      const result = await client.createOrder({
        items: [
          { productId: 'p1', amount: 2, price: 10.5 },
          { productId: 'p2', amount: 1, price: 3.0 },
        ],
      });

      expect(result).toEqual({ id: 'rk-999' });
      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://rk.test/api/v1/orders');
      expect(opts.method).toBe('POST');
      expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      expect(JSON.parse(opts.body as string)).toEqual({
        items: [
          { productId: 'p1', amount: 2, price: 10.5 },
          { productId: 'p2', amount: 1, price: 3.0 },
        ],
      });
    });

    it('throws on non-OK response', async () => {
      fetchSpy.mockResolvedValueOnce({ ok: false, status: 422 } as Response);
      await expect(
        client.createOrder({ items: [{ productId: 'p1', amount: 1, price: 5 }] }),
      ).rejects.toThrow('r_keeper API error: 422');
    });
  });

  describe('ping', () => {
    it('returns latency in milliseconds on success', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      } as Response);

      const latency = await client.ping();

      expect(typeof latency).toBe('number');
      expect(latency).toBeGreaterThanOrEqual(0);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://rk.test/api/v1/status',
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }) }),
      );
    });

    it('throws on failed ping', async () => {
      fetchSpy.mockResolvedValueOnce({ ok: false, status: 503 } as Response);
      await expect(client.ping()).rejects.toThrow('r_keeper ping failed: 503');
    });
  });
});
