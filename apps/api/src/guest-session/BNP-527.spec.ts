import { encryptCredentials } from '../tenant/payment-credentials';
import { GuestSessionService } from './guest-session.service';

describe('BNP-527 ERIP payment creation', () => {
  it('saves and returns the E-POS account number for a pending payment', async () => {
    const secret = 'credentials-key';
    const paymentUpdate = jest.fn().mockResolvedValue({});
    const paymentCreate = jest.fn().mockResolvedValue({ id: 'payment-1', amountByn: '8.25', tipsAmountByn: '0' });
    const prisma = {
      db: { tenant: { findUnique: jest.fn().mockResolvedValue({ name: 'Cafe', paymentCredentials: { erip: encryptCredentials({ shopId: 'shop-1', serviceId: 'service-1', secret: 'provider-secret' }, secret) } }) } },
      forTenant: jest.fn(() => ({
        order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1', dailyOrderNumber: 42, status: 'SERVED', isPaid: false, totalAmountByn: '8.25', tipsAmountByn: '0' }) },
        payment: { findFirst: jest.fn().mockResolvedValue(null), create: paymentCreate, update: paymentUpdate },
      })),
    };
    const eripClient = { create: jest.fn().mockResolvedValue({ uid: 'provider-1', serviceNo: 12345678, accountNumber: '000000000042', instruction: ['Pay via ERIP'], qrCode: 'qr-data', banks: [] }) };
    const service = new GuestSessionService(prisma as never, {} as never, {} as never, {} as never, eripClient as never);
    const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;
    process.env.PAYMENT_CREDENTIALS_SECRET = secret;

    try {
      await expect(service.createEripPayment('order-1', 'tenant-1', 'table-1', '127.0.0.1')).resolves.toEqual({
        paymentId: 'payment-1', serviceNo: 12345678, accountNumber: '000000000042', instruction: ['Pay via ERIP'], qrCode: 'qr-data', banks: [],
      });
      expect(eripClient.create).toHaveBeenCalledWith(expect.objectContaining({ shopId: 'shop-1', secret: 'provider-secret', serviceId: 'service-1', orderId: 'order-1', paymentId: 'payment-1' }));
      expect(paymentUpdate).toHaveBeenCalledWith({ where: { id: 'payment-1' }, data: { providerTransactionId: 'provider-1', eripOrderNumber: '000000000042', payload: { uid: 'provider-1', serviceNo: 12345678, accountNumber: '000000000042', instruction: ['Pay via ERIP'], qrCode: 'qr-data', banks: [] } } });
    } finally {
      if (previousSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
      else process.env.PAYMENT_CREDENTIALS_SECRET = previousSecret;
    }
  });
});
