import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IikoAuthService } from './iiko-auth.service';
import { IikoCryptoService } from './iiko-crypto.service';
import { IikoConfig } from './iiko.types';

const TEST_CONFIG: IikoConfig = {
  login: 'restaurant-login',
  password_encrypted: 'encrypted-secret',
  concept_id: 'concept-123',
};

describe('IikoAuthService', () => {
  let service: IikoAuthService;
  let cryptoService: { decrypt: jest.Mock };

  beforeEach(async () => {
    cryptoService = { decrypt: jest.fn().mockReturnValue('plain-password') };

    const module = await Test.createTestingModule({
      providers: [
        IikoAuthService,
        { provide: IikoCryptoService, useValue: cryptoService },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def: string) =>
              key === 'IIKO_API_BASE_URL' ? 'https://mock-iiko.test' : def,
          },
        },
      ],
    }).compile();

    service = module.get(IikoAuthService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetches a token and returns it', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'auth-token-abc' }),
    } as Response);

    const token = await service.getToken('tenant-1', TEST_CONFIG);

    expect(token).toBe('auth-token-abc');
    expect(cryptoService.decrypt).toHaveBeenCalledWith('encrypted-secret');
    expect(fetch).toHaveBeenCalledWith(
      'https://mock-iiko.test/api/0/auth/login',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns cached token on second call without re-fetching', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'auth-token-cached' }),
      } as Response);

    await service.getToken('tenant-1', TEST_CONFIG);
    const token = await service.getToken('tenant-1', TEST_CONFIG);

    expect(token).toBe('auth-token-cached');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-fetches when cached token is about to expire', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'new-token' }),
      } as Response);

    await service.getToken('tenant-1', TEST_CONFIG);

    // Simulate token near expiry by manipulating the cache
    const cache = (service as unknown as { tokenCache: Map<string, { token: string; expiresAt: number }> }).tokenCache;
    cache.set('tenant-1', { token: 'old-token', expiresAt: Date.now() + 30_000 });

    const token = await service.getToken('tenant-1', TEST_CONFIG);

    expect(token).toBe('new-token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws when iiko login returns non-ok response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    await expect(service.getToken('tenant-1', TEST_CONFIG)).rejects.toThrow(
      'iiko auth failed with status 401',
    );
  });
});
