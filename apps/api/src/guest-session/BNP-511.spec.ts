import { generateKeyPairSync, sign } from 'node:crypto';
import { encryptCredentials } from '../tenant/payment-credentials';
import { BepaidWebhookService } from './bepaid-webhook';

describe('BNP-511 bePaid webhook signature', () => {
  const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
    else process.env.PAYMENT_CREDENTIALS_SECRET = previousSecret;
  });

  it('rejects a body signed by a different RSA key without queueing it', async () => {
    const trusted = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const secret = 'credentials-secret';
    process.env.PAYMENT_CREDENTIALS_SECRET = secret;
    const encrypted = encryptCredentials({ provider: 'bepaid', shopId: 'shop', secret: 'gateway-secret', publicKey: trusted.publicKey.export({ type: 'spki', format: 'pem' }) }, secret);
    const queueAdd = jest.fn();
    const service = Object.create(BepaidWebhookService.prototype) as BepaidWebhookService;
    Object.assign(service, {
      prisma: { db: { tenant: { findUnique: jest.fn().mockResolvedValue({ paymentCredentials: { bepaid: encrypted } }) } } },
      queue: { add: queueAdd },
    });
    const raw = Buffer.from('{"transaction":{"tracking_id":"payment-1","status":"successful"}}');
    const signature = sign('RSA-SHA256', raw, attacker.privateKey).toString('base64');

    await expect(service.accept('tenant-1', raw, signature, `Basic ${Buffer.from('shop:gateway-secret').toString('base64')}`)).rejects.toMatchObject({ status: 401 });
    expect(queueAdd).not.toHaveBeenCalled();
  });
});
