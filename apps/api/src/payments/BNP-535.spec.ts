import { encryptCredentials } from '../tenant/payment-credentials';
import { GuestSessionService } from '../guest-session/guest-session.service';

describe('BNP-535 bePaid ERIP failure handling', () => {
  it('fails a payment without a provider transaction and allows a retry', async () => {
    const secret = 'credentials-key';
    const payments: Array<{ id: string; status: string; providerTransactionId?: string }> = [];
    const paymentUpdate = jest.fn(({ where, data }: { where: { id: string }; data: { status?: string; providerTransactionId?: string; eripOrderNumber?: string; payload?: object } }) => {
      const payment = payments.find((item) => item.id === where.id);
      if (payment) Object.assign(payment, data);
      return Promise.resolve(payment);
    });
    const paymentCreate = jest.fn(() => {
      const payment = { id: `payment-${payments.length + 1}`, status: 'PENDING' };
      payments.push(payment);
      return Promise.resolve({ ...payment, amountByn: '25', tipsAmountByn: '0' });
    });
    const prisma = {
      db: { tenant: { findUnique: jest.fn().mockResolvedValue({ paymentCredentials: { erip: encryptCredentials({ shopId: 'shop-1', serviceId: 'service-1', secret: 'provider-secret' }, secret) } }) } },
      forTenant: jest.fn(() => ({
        order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1', dailyOrderNumber: 42, status: 'SERVED', isPaid: false, totalAmountByn: '25', tipsAmountByn: '0' }) },
        payment: { findFirst: jest.fn().mockResolvedValue(null), create: paymentCreate, update: paymentUpdate },
      })),
    };
    const eripClient = {
      create: jest.fn()
        .mockRejectedValueOnce(new Error('provider unavailable'))
        .mockResolvedValueOnce({ uid: 'provider-transaction-2', serviceNo: 12345678, accountNumber: '000000000042', instruction: [], qrCode: 'qr-data', banks: [] }),
    };
    const service = new GuestSessionService(prisma as never, {} as never, {} as never, {} as never, eripClient as never);
    const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;
    process.env.PAYMENT_CREDENTIALS_SECRET = secret;

    try {
      await expect(service.createEripPayment('order-1', 'tenant-1', 'table-1', '127.0.0.1')).rejects.toThrow('provider unavailable');
      expect(payments).toEqual([{ id: 'payment-1', status: 'FAILED' }]);
      expect(payments.some((payment) => payment.status === 'PENDING' && !payment.providerTransactionId)).toBe(false);

      await expect(service.createEripPayment('order-1', 'tenant-1', 'table-1', '127.0.0.1')).resolves.toEqual({
        paymentId: 'payment-2', serviceNo: 12345678, accountNumber: '000000000042', instruction: [], qrCode: 'qr-data', banks: [],
      });
      expect(eripClient.create).toHaveBeenCalledTimes(2);
      expect(payments).toMatchObject([
        { id: 'payment-1', status: 'FAILED' },
        { id: 'payment-2', status: 'PENDING', providerTransactionId: 'provider-transaction-2' },
      ]);
    } finally {
      if (previousSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
      else process.env.PAYMENT_CREDENTIALS_SECRET = previousSecret;
    }
  });
});
