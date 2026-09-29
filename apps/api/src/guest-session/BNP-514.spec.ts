import { BadGatewayException } from '@nestjs/common';
import { encryptCredentials } from '../tenant/payment-credentials';
import { BepaidClient } from './bepaid.client';
import { GuestSessionService } from './guest-session.service';

describe('BNP-514 bePaid credential confidentiality', () => {
  const encryptionKey = 'test-encryption-key';
  const gatewaySecret = 'private-gateway-secret';
  const publicKey = '-----BEGIN PUBLIC KEY-----\nprivate-signature-key\n-----END PUBLIC KEY-----';
  const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;
  const encrypted = encryptCredentials({
    provider: 'bepaid',
    shopId: 'private-shop-id',
    secret: gatewaySecret,
    publicKey,
    environment: 'TEST',
  }, encryptionKey);
  const orderFindFirst = jest.fn();
  const paymentFindFirst = jest.fn();
  const paymentCreate = jest.fn();
  const paymentUpdate = jest.fn();
  const createCheckout = jest.fn();
  const prisma = {
    forTenant: jest.fn(() => ({
      order: { findFirst: orderFindFirst },
      payment: { findFirst: paymentFindFirst, create: paymentCreate, update: paymentUpdate },
    })),
    db: {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ paymentCredentials: { bepaid: encrypted } }),
      },
    },
  };
  const service = new GuestSessionService(
    prisma as never,
    {} as never,
    { enqueue: jest.fn() },
    { createCheckout } as never,
  );

  const expectSafe = (value: unknown) => {
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain(gatewaySecret);
    expect(serialized).not.toContain(publicKey);
  };

  beforeEach(() => {
    process.env.PAYMENT_CREDENTIALS_SECRET = encryptionKey;
    jest.clearAllMocks();
    orderFindFirst.mockResolvedValue({
      id: 'order-1', status: 'SERVED', isPaid: false, totalAmountByn: '12.50',
    });
    paymentFindFirst.mockResolvedValue(null);
    paymentCreate.mockResolvedValue({ id: 'payment-1', amountByn: '12.50' });
    paymentUpdate.mockResolvedValue({});
    createCheckout.mockResolvedValue({
      token: 'checkout-token', redirectUrl: 'https://checkout.bepaid.by/test',
    });
  });

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
    else process.env.PAYMENT_CREDENTIALS_SECRET = previousSecret;
  });

  it('keeps credentials out of the successful payment API response and stored payment data', async () => {
    const response = await service.createCardPayment('order-1', 'tenant-1', 'table-1');

    expect(response).toEqual({ redirectUrl: 'https://checkout.bepaid.by/test' });
    expectSafe(response);
    expectSafe(paymentCreate.mock.calls);
    expect(createCheckout).toHaveBeenCalledWith(expect.objectContaining({
      shopId: 'private-shop-id', secret: gatewaySecret, amount: 1250,
      paymentId: 'payment-1', orderId: 'order-1', test: true,
    }));
  });

  it('returns a guest-safe checkout error without credentials', async () => {
    const previousGuestUrl = process.env.GUEST_WEB_URL;
    const previousApiUrl = process.env.API_PUBLIC_URL;
    process.env.GUEST_WEB_URL = 'https://guest.example.test';
    process.env.API_PUBLIC_URL = 'https://api.example.test';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ errors: { message: gatewaySecret, public_key: publicKey } }),
    } as Response);
    const serviceWithRealClient = new GuestSessionService(
      prisma as never,
      {} as never,
      { enqueue: jest.fn() },
      new BepaidClient(),
    );

    try {
      let guestMessage = '';
      try {
        await serviceWithRealClient.createCardPayment('order-1', 'tenant-1', 'table-1');
      } catch (error) {
        if (error instanceof BadGatewayException) guestMessage = error.message;
        expectSafe(error instanceof BadGatewayException ? error.getResponse() : error);
      }

      expect(guestMessage).toBe('Не удалось создать платёж. Попробуйте ещё раз');
      expectSafe(guestMessage);
      expect(paymentUpdate).toHaveBeenCalledWith({
        where: { id: 'payment-1' }, data: { status: 'FAILED' },
      });
    } finally {
      jest.restoreAllMocks();
      if (previousGuestUrl === undefined) delete process.env.GUEST_WEB_URL;
      else process.env.GUEST_WEB_URL = previousGuestUrl;
      if (previousApiUrl === undefined) delete process.env.API_PUBLIC_URL;
      else process.env.API_PUBLIC_URL = previousApiUrl;
    }
  });

  it('keeps the credentials out of payment status responses and encrypted storage', async () => {
    paymentFindFirst.mockResolvedValue({
      status: 'PENDING', createdAt: new Date('2026-09-29T12:00:00.000Z'),
    });
    const statusResponse = await service.getCardPaymentStatus('order-1', 'tenant-1', 'table-1');

    expect(statusResponse).toEqual(expect.objectContaining({ paymentStatus: 'PENDING', paymentEnabled: true }));
    expectSafe(statusResponse);
    expectSafe(encrypted);
  });
});
