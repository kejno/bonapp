import {
  decryptCredentials,
  encryptCredentials,
  validateCredentials,
} from './payment-credentials';

describe('payment credentials encryption', () => {
  it('stores multiple gateway credentials encrypted and decrypts only for authorized internal use', () => {
    const secret = 'test-secret';
    const input = validateCredentials({
      gateway: 'erip',
      serviceId: 'service-1',
      secret: 'private-value',
    });
    const encrypted = encryptCredentials(input, secret);
    expect(JSON.stringify(encrypted)).not.toContain('private-value');
    expect(decryptCredentials(encrypted, secret)).toEqual(input);
    const second = encryptCredentials(
      validateCredentials({ gateway: 'oplati', merchantId: 'merchant-2' }),
      secret,
    );
    expect(decryptCredentials(second, secret)).toEqual({
      gateway: 'oplati',
      merchantId: 'merchant-2',
    });
  });

  it('rejects incomplete or invalid gateway credentials', () => {
    expect(() =>
      validateCredentials({
        gateway: 'bepaid',
        provider: 'webpay',
        shopId: 'shop',
        secret: '',
        environment: 'PROD',
      }),
    ).toThrow();
    expect(() =>
      validateCredentials({
        gateway: 'skno',
        cashRegisterSerial: 'serial',
        unp: '',
      }),
    ).toThrow();
  });
});
