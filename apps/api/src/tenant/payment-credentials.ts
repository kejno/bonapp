import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'node:crypto';

export type PaymentGateway = 'oplati' | 'erip' | 'bepaid' | 'skno';
export type PaymentCredentialInput =
  | { gateway: 'oplati'; merchantId: string }
  | { gateway: 'erip'; serviceId: string; secret: string }
  | {
      gateway: 'bepaid';
      provider: 'bepaid' | 'webpay';
      shopId: string;
      secret: string;
      environment: 'TEST' | 'PROD';
    }
  | { gateway: 'skno'; cashRegisterSerial: string; unp: string };

export interface EncryptedCredentials {
  version: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export function encryptCredentials(
  credentials: PaymentCredentialInput,
  secret: string,
): EncryptedCredentials {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    createHash('sha256').update(secret).digest(),
    iv,
  );
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), 'utf8'),
    cipher.final(),
  ]);
  return {
    version: 1,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function decryptCredentials<T>(
  encrypted: EncryptedCredentials,
  secret: string,
): T {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    createHash('sha256').update(secret).digest(),
    Buffer.from(encrypted.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8'),
  ) as T;
}

export function validateCredentials(input: unknown): PaymentCredentialInput {
  if (!input || typeof input !== 'object')
    throw new Error('Некорректные реквизиты шлюза');
  const value = input as Record<string, unknown>;
  const required = (...fields: string[]) =>
    fields.every(
      (field) =>
        typeof value[field] === 'string' && value[field].trim().length > 0,
    );
  if (value.gateway === 'oplati' && required('merchantId'))
    return {
      gateway: 'oplati',
      merchantId: (value.merchantId as string).trim(),
    };
  if (value.gateway === 'erip' && required('serviceId', 'secret'))
    return {
      gateway: 'erip',
      serviceId: (value.serviceId as string).trim(),
      secret: value.secret as string,
    };
  if (
    value.gateway === 'bepaid' &&
    (value.provider === 'bepaid' || value.provider === 'webpay') &&
    (value.environment === 'TEST' || value.environment === 'PROD') &&
    required('shopId', 'secret')
  )
    return {
      gateway: 'bepaid',
      provider: value.provider,
      shopId: (value.shopId as string).trim(),
      secret: value.secret as string,
      environment: value.environment,
    };
  if (value.gateway === 'skno' && required('cashRegisterSerial', 'unp'))
    return {
      gateway: 'skno',
      cashRegisterSerial: (value.cashRegisterSerial as string).trim(),
      unp: (value.unp as string).trim(),
    };
  throw new Error('Заполните обязательные поля платёжного шлюза');
}

export function isEncryptedCredentials(
  value: unknown,
): value is EncryptedCredentials {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    entry.version === 1 &&
    typeof entry.iv === 'string' &&
    typeof entry.authTag === 'string' &&
    typeof entry.ciphertext === 'string'
  );
}
