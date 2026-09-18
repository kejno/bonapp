import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OplatiService } from './oplati.service';

describe('OplatiService', () => {
  let service: OplatiService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OplatiService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              const values: Record<string, string> = {
                OPLATI_BASE_URL: 'http://oplati.mock',
                OPLATI_API_KEY: 'test-key',
                OPLATI_CALLBACK_URL: 'http://app.test/webhooks/oplati',
              };
              return values[key];
            },
          },
        },
      ],
    }).compile();

    service = module.get<OplatiService>(OplatiService);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('createPayment calls Oplati API with correct payload and returns payment data', async () => {
    const mockResponse = {
      paymentId: 'ext-abc123',
      qrCodeData: 'data:image/png;base64,abc',
      deepLink: 'oplati://pay?id=abc123',
      eripCode: '1234567890',
    };

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const result = await service.createPayment('order-1', 4500);

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://oplati.mock/api/payments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          orderId: 'order-1',
          amount: 4500,
          currency: 'BYN',
          callbackUrl: 'http://app.test/webhooks/oplati',
        }),
      }),
    );

    expect(result).toEqual({
      externalId: 'ext-abc123',
      qrCodeData: 'data:image/png;base64,abc',
      deepLink: 'oplati://pay?id=abc123',
      eripCode: '1234567890',
    });
  });

  it('createPayment sets eripCode to null when not returned by API', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          paymentId: 'ext-xyz',
          qrCodeData: 'qr-data',
          deepLink: 'oplati://pay?id=xyz',
        }),
    } as Response);

    const result = await service.createPayment('order-2', 1000);

    expect(result.eripCode).toBeNull();
  });

  it('createPayment throws when Oplati API returns non-ok response', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 502,
    } as Response);

    await expect(service.createPayment('order-3', 500)).rejects.toThrow(
      'Oplati API error: 502',
    );
  });
});
