import { encryptCredentials } from '../tenant/payment-credentials';
import { GuestSessionService } from '../guest-session/guest-session.service';

describe('BNP-534 repeated ERIP initiation', () => {
  it('returns the active E-POS request without creating another provider request', async () => {
    const secret = 'credentials-key';
    const activePayment = {
      id: 'payment-1',
      providerTransactionId: 'uid-1',
      eripOrderNumber: '000000000042',
      payload: { serviceNo: 12345678, instruction: ['Pay via ERIP'], qrCode: 'encoded-qr', banks: [] },
      createdAt: new Date(),
    };
    const paymentCreate = jest.fn();
    const eripClient = { create: jest.fn() };
    const prisma = {
      db: { tenant: { findUnique: jest.fn().mockResolvedValue({ name: 'Cafe', paymentCredentials: { erip: encryptCredentials({ shopId: 'shop-1', serviceId: 'service-1', secret: 'provider-secret' }, secret) } }) } },
      forTenant: jest.fn(() => ({
        order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1', dailyOrderNumber: 42, status: 'SERVED', isPaid: false, totalAmountByn: '25', tipsAmountByn: '0' }) },
        payment: { findFirst: jest.fn().mockResolvedValue(activePayment), create: paymentCreate },
      })),
    };
    const service = new GuestSessionService(prisma as never, {} as never, {} as never, {} as never, eripClient as never);
    const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;
    process.env.PAYMENT_CREDENTIALS_SECRET = secret;

    try {
      const first = await service.createEripPayment('order-1', 'tenant-1', 'table-1', '127.0.0.1');
      const second = await service.createEripPayment('order-1', 'tenant-1', 'table-1', '127.0.0.1');

      expect(first).toEqual({ paymentId: 'payment-1', serviceNo: 12345678, accountNumber: '000000000042', instruction: ['Pay via ERIP'], qrCode: 'encoded-qr', banks: [] });
      expect(second).toEqual(first);
      expect(paymentCreate).not.toHaveBeenCalled();
      expect(eripClient.create).not.toHaveBeenCalled();
    } finally {
      if (previousSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
      else process.env.PAYMENT_CREDENTIALS_SECRET = previousSecret;
    }
  });
});
