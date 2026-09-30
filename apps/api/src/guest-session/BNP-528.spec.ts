import { encryptCredentials } from '../tenant/payment-credentials';
import { GuestSessionService } from './guest-session.service';

describe('BNP-528 card checkout URL', () => {
  it('creates a card checkout and returns its hosted payment URL', async () => {
    const secret = 'credentials-key';
    const paymentCreate = jest.fn().mockResolvedValue({ id: 'payment-1', amountByn: '12.50' });
    const createCheckout = jest.fn().mockResolvedValue({
      token: 'checkout-token',
      redirectUrl: 'https://checkout.bepaid.by/test',
    });
    const prisma = {
      db: {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            paymentCredentials: {
              bepaid: encryptCredentials({
                provider: 'bepaid',
                shopId: 'test-shop',
                secret: 'test-secret',
                publicKey: 'test-public-key',
                environment: 'TEST',
              }, secret),
            },
          }),
        },
      },
      forTenant: jest.fn(() => ({
        order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1', status: 'SERVED', isPaid: false, totalAmountByn: '12.50' }) },
        payment: { findFirst: jest.fn().mockResolvedValue(null), create: paymentCreate, update: jest.fn() },
      })),
    };
    const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;
    process.env.PAYMENT_CREDENTIALS_SECRET = secret;
    const service = new GuestSessionService(prisma as never, {} as never, { enqueue: jest.fn() }, { createCheckout } as never);

    try {
      await expect(service.createCardPayment('order-1', 'tenant-1', 'table-1')).resolves.toEqual({
        redirectUrl: 'https://checkout.bepaid.by/test',
      });
      expect(paymentCreate).toHaveBeenCalledTimes(1);
      expect(createCheckout).toHaveBeenCalledWith(expect.objectContaining({
        paymentId: 'payment-1',
        orderId: 'order-1',
        amount: 1250,
        test: true,
      }));
    } finally {
      if (previousSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
      else process.env.PAYMENT_CREDENTIALS_SECRET = previousSecret;
    }
  });
});
