import { encryptCredentials } from '../tenant/payment-credentials';
import { GuestSessionService } from './guest-session.service';

describe('BNP-534 repeated ERIP initiation', () => {
  it('returns the active E-POS request without creating a second provider request', async () => {
    const secret = 'test-encryption-key';
    const paymentFindFirst = jest.fn().mockResolvedValue({
      id: 'payment-1', status: 'PENDING', providerTransactionId: 'provider-uid-1', eripOrderNumber: '000000000042',
      payload: { serviceNo: 12345678, instruction: ['Банк', 'ЕРИП'], qrCode: 'qr-content' },
      createdAt: new Date(),
    });
    const paymentCreate = jest.fn();
    const eripClient = { create: jest.fn() };
    const prisma = {
      db: { tenant: { findUnique: jest.fn().mockResolvedValue({ paymentCredentials: { erip: encryptCredentials({ shopId: 'shop', serviceId: '12345678', secret: 'provider-secret' }, secret) } }) } },
      forTenant: jest.fn(() => ({
        order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1', dailyOrderNumber: 42, status: 'SERVED', isPaid: false, totalAmountByn: '12.50', tipsAmountByn: '0.00' }) },
        payment: { findFirst: paymentFindFirst, create: paymentCreate },
      })),
    };
    const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;
    process.env.PAYMENT_CREDENTIALS_SECRET = secret;
    const service = new GuestSessionService(prisma as never, {} as never, { enqueue: jest.fn() }, undefined, eripClient as never);

    try {
      const first = await service.createEripPayment('order-1', 'tenant-1', 'table-1', '203.0.113.4');
      const second = await service.createEripPayment('order-1', 'tenant-1', 'table-1', '203.0.113.4');

      expect(first).toEqual(second);
      expect(first).toEqual({
        paymentId: 'payment-1', serviceNo: 12345678, accountNumber: '000000000042',
        instruction: ['Банк', 'ЕРИП'], qrCode: 'qr-content', banks: [],
      });
      expect(paymentFindFirst).toHaveBeenCalledTimes(2);
      expect(paymentCreate).not.toHaveBeenCalled();
      expect(eripClient.create).not.toHaveBeenCalled();
    } finally {
      if (previousSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
      else process.env.PAYMENT_CREDENTIALS_SECRET = previousSecret;
    }
  });
});
