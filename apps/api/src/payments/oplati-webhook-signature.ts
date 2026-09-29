import { createHmac, timingSafeEqual } from 'node:crypto';

/** Verifies the provider's documented HMAC-SHA256 over the untouched body bytes. */
export function verifyOplatiSignature(body: Buffer, signature: string, secret: string, algorithm: string): boolean {
  if (!signature || !secret || !/^(?:[a-f\d]{2})+$/i.test(signature)) return false;
  let expected: Buffer;
  try {
    expected = createHmac(algorithm, secret).update(body).digest();
  } catch {
    return false;
  }
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}
