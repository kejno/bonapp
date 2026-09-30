import { encryptCredentials } from '../tenant/payment-credentials';
import { GuestSessionService } from './guest-session.service';

describe('BNP-433 card checkout', () => {
  const secret = 'test-credentials-key';
  const paymentCreate = jest.fn((args: { data: Record<string, unknown> }) => {
    void args;
    return Promise.resolve({ id: 'payment-1', amountByn: '12.50' });
  });
  const paymentUpdate = jest.fn();
  const client = { createCheckout: jest.fn(), getCheckoutStatus: jest.fn() };
  const prisma = {
    db: { tenant: { findUnique: jest.fn().mockResolvedValue({ paymentCredentials: { bepaid: encryptCredentials({ provider: 'bepaid', shopId: 'test-shop', secret: 'test-secret', publicKey: 'test-public-key', environment: 'TEST' }, secret) } }) } },
    forTenant: jest.fn(() => ({
      order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1', status: 'SERVED', isPaid: false, totalAmountByn: '12.50' }) },
      payment: { findFirst: jest.fn().mockResolvedValue(null), create: paymentCreate, update: paymentUpdate },
    })),
  };
  const service = new GuestSessionService(prisma as never, {} as never, { enqueue: jest.fn() }, client);
  const priorSecret = process.env.PAYMENT_CREDENTIALS_SECRET;

  beforeEach(() => {
    process.env.PAYMENT_CREDENTIALS_SECRET = secret;
    paymentCreate.mockResolvedValue({ id: 'payment-1', amountByn: '12.50' });
    paymentUpdate.mockResolvedValue({});
    client.createCheckout.mockResolvedValue({ token: 'checkout-token', redirectUrl: 'https://checkout.bepaid.by/test' });
  });
  afterAll(() => {
    if (priorSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
    else process.env.PAYMENT_CREDENTIALS_SECRET = priorSecret;
  });

  it('creates a BYN checkout for the selected order and returns its hosted redirect URL', async () => {
    await expect(service.createCardPayment('order-1', 'tenant-1', 'table-1')).resolves.toEqual({ redirectUrl: 'https://checkout.bepaid.by/test' });
    expect(paymentCreate.mock.calls[0]?.[0].data).toMatchObject({ orderId: 'order-1', amountByn: '12.50', provider: 'bepaid', method: 'BANK_CARD', status: 'PENDING' });
    expect(client.createCheckout).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 'payment-1', orderId: 'order-1', amount: 1250, test: true }));
  });
});
