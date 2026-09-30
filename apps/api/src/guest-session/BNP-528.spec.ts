import { encryptCredentials } from '../tenant/payment-credentials';
import { GuestSessionService } from './guest-session.service';

describe('BNP-528 card Checkout creation', () => {
  it('returns the Checkout redirect URL and stores its token on the pending payment', async () => {
    const secret = 'credentials-key';
    const paymentUpdate = jest.fn().mockResolvedValue({});
    const paymentCreate = jest.fn().mockResolvedValue({ id: 'payment-1', amountByn: '8.25' });
    const prisma = {
      db: { tenant: { findUnique: jest.fn().mockResolvedValue({ paymentCredentials: { bepaid: encryptCredentials({ provider: 'bepaid', shopId: 'shop-1', secret: 'provider-secret', environment: 'TEST' }, secret) } }) } },
      forTenant: jest.fn(() => ({
        order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1', status: 'SERVED', isPaid: false, totalAmountByn: '8.25' }) },
        payment: { findFirst: jest.fn().mockResolvedValue(null), create: paymentCreate, update: paymentUpdate },
      })),
    };
    const bepaidClient = { createCheckout: jest.fn().mockResolvedValue({ token: 'checkout-token', redirectUrl: 'https://pay.example/checkout' }) };
    const service = new GuestSessionService(prisma as never, {} as never, {} as never, bepaidClient as never);
    const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;
    process.env.PAYMENT_CREDENTIALS_SECRET = secret;

    try {
      await expect(service.createCardPayment('order-1', 'tenant-1', 'table-1')).resolves.toEqual({ redirectUrl: 'https://pay.example/checkout' });
      expect(bepaidClient.createCheckout).toHaveBeenCalledWith({ shopId: 'shop-1', secret: 'provider-secret', amount: 825, paymentId: 'payment-1', orderId: 'order-1', tenantId: 'tenant-1', test: true });
      expect(paymentUpdate).toHaveBeenCalledWith({ where: { id: 'payment-1' }, data: { payload: { token: 'checkout-token' } } });
    } finally {
      if (previousSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
      else process.env.PAYMENT_CREDENTIALS_SECRET = previousSecret;
    }
  });
});
