import { BadGatewayException, Logger } from '@nestjs/common';
import { encryptCredentials } from '../tenant/payment-credentials';
import { GuestSessionService } from './guest-session.service';

describe('BNP-535 ERIP provider error', () => {
  const credentialsSecret = 'test-encryption-key';
  const providerSecret = 'private-provider-secret';
  const payments: Array<{ id: string; status: string; providerTransactionId?: string }> = [];
  const paymentCreate = jest.fn(() => {
    const payment = { id: `payment-${payments.length + 1}`, status: 'PENDING', amountByn: '12.50', tipsAmountByn: '0.00' };
    payments.push(payment);
    return payment;
  });
  const paymentUpdate = jest.fn(({ where, data }: { where: { id: string }; data: Partial<(typeof payments)[number]> }) => {
    const payment = payments.find(({ id }) => id === where.id);
    if (payment) Object.assign(payment, data);
    return payment;
  });
  const paymentFindFirst = jest.fn(() => payments.find(({ status }) => status === 'PENDING') ?? null);
  const eripClient = { create: jest.fn() };
  const prisma = {
    db: { tenant: { findUnique: jest.fn().mockResolvedValue({
      name: 'Cafe',
      paymentCredentials: { erip: encryptCredentials({ shopId: 'shop', serviceId: '12345678', secret: providerSecret }, credentialsSecret) },
    }) } },
    forTenant: jest.fn(() => ({
      order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1', dailyOrderNumber: 42, status: 'SERVED', isPaid: false, totalAmountByn: '12.50', tipsAmountByn: '0.00' }) },
      payment: { findFirst: paymentFindFirst, create: paymentCreate, update: paymentUpdate, updateMany: jest.fn() },
    })),
  };
  const service = new GuestSessionService(prisma as never, {} as never, { enqueue: jest.fn() }, undefined, eripClient as never);
  const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;
  const previousApiUrl = process.env.API_PUBLIC_URL;

  beforeEach(() => {
    process.env.PAYMENT_CREDENTIALS_SECRET = credentialsSecret;
    process.env.API_PUBLIC_URL = 'https://api.example.test';
    payments.length = 0;
    jest.clearAllMocks();
    eripClient.create
      .mockRejectedValueOnce(new BadGatewayException('Платёжный сервис временно недоступен'))
      .mockResolvedValueOnce({ uid: 'provider-uid-2', accountNumber: '000000000042', serviceNo: 12345678, instruction: [], qrCode: null, banks: [] });
  });

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
    else process.env.PAYMENT_CREDENTIALS_SECRET = previousSecret;
    if (previousApiUrl === undefined) delete process.env.API_PUBLIC_URL;
    else process.env.API_PUBLIC_URL = previousApiUrl;
  });

  it('fails the pending payment safely and lets the guest retry without exposing credentials', async () => {
    const errorLogs = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const warningLogs = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    try {
      const failure = service.createEripPayment('order-1', 'tenant-1', 'table-1', '203.0.113.4');
      await expect(failure).rejects.toMatchObject({ message: 'Платёжный сервис временно недоступен' });

      expect(payments).toMatchObject([{ id: 'payment-1', status: 'FAILED' }]);
      expect(payments.some(({ status, providerTransactionId }) => status === 'PENDING' && !providerTransactionId)).toBe(false);
      expect(JSON.stringify(errorLogs.mock.calls)).not.toContain(providerSecret);
      expect(JSON.stringify(warningLogs.mock.calls)).not.toContain(providerSecret);

      await expect(service.createEripPayment('order-1', 'tenant-1', 'table-1', '203.0.113.4')).resolves.toMatchObject({
        paymentId: 'payment-2', serviceNo: 12345678, accountNumber: '000000000042',
      });
      expect(paymentCreate).toHaveBeenCalledTimes(2);
      expect(eripClient.create).toHaveBeenCalledTimes(2);
      expect(payments).toMatchObject([
        { id: 'payment-1', status: 'FAILED' },
        { id: 'payment-2', status: 'PENDING', providerTransactionId: 'provider-uid-2' },
      ]);
    } finally {
      errorLogs.mockRestore();
      warningLogs.mockRestore();
    }
  });
});
