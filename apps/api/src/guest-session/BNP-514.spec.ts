import { encryptCredentials } from '../tenant/payment-credentials';
import { GuestSessionService } from './guest-session.service';

describe('BNP-514 bePaid credential confidentiality', () => {
  it('keeps gateway secrets out of guest status responses and encrypted credential storage', async () => {
    const password = 'private-gateway-secret';
    const publicKey = 'private-signature-key';
    const encrypted = encryptCredentials({ provider: 'bepaid', shopId: 'private-shop-id', secret: password, publicKey, environment: 'TEST' }, 'encryption-key');
    expect(JSON.stringify(encrypted)).not.toContain(password);
    expect(JSON.stringify(encrypted)).not.toContain(publicKey);

    const prisma = {
      forTenant: jest.fn(() => ({
        order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1', status: 'SERVED' }) },
        payment: { findFirst: jest.fn().mockResolvedValue({ status: 'PENDING', createdAt: new Date('2026-09-29T12:00:00.000Z') }) },
      })),
      db: { tenant: { findUnique: jest.fn().mockResolvedValue({ paymentCredentials: { bepaid: encrypted } }) } },
    };
    const service = new GuestSessionService(prisma as never, {} as never, { enqueue: jest.fn() });
    const previous = process.env.PAYMENT_CREDENTIALS_SECRET;
    process.env.PAYMENT_CREDENTIALS_SECRET = 'encryption-key';

    const response = await service.getCardPaymentStatus('order-1', 'tenant-1', 'table-1');
    expect(response).toEqual(expect.objectContaining({ paymentStatus: 'PENDING', paymentEnabled: true }));
    expect(JSON.stringify(response)).not.toContain(password);
    expect(JSON.stringify(response)).not.toContain(publicKey);

    if (previous === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
    else process.env.PAYMENT_CREDENTIALS_SECRET = previous;
  });
});
