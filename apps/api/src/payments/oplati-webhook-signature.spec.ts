import { createHmac } from 'node:crypto';
import { verifyOplatiSignature } from './oplati-webhook-signature';

describe('verifyOplatiSignature', () => {
  const body = Buffer.from('{"event":"payment.completed"}');
  const secret = 'sandbox-secret';

  it('verifies the exact request bytes', () => {
    const signature = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyOplatiSignature(body, signature, secret, 'sha256')).toBe(true);
    expect(verifyOplatiSignature(Buffer.from('{ "event":"payment.completed"}'), signature, secret, 'sha256')).toBe(false);
  });

  it('rejects malformed signatures', () => {
    expect(verifyOplatiSignature(body, 'not-a-signature', secret, 'sha256')).toBe(false);
    expect(verifyOplatiSignature(body, '', secret, 'sha256')).toBe(false);
  });
});
