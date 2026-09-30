import { BadGatewayException } from '@nestjs/common';
import { encryptCredentials } from '../tenant/payment-credentials';
import { GuestSessionService } from './guest-session.service';

describe('BNP-513 bePaid checkout API error', () => {
  it('marks the pending payment failed and returns a safe guest error', async () => {
    const secret = 'credentials-key';
    const paymentUpdate = jest.fn().mockResolvedValue({});
    const paymentCreate = jest.fn().mockResolvedValue({ id: 'payment-1', amountByn: '8.25' });
    const prisma = {
      db: { tenant: { findUnique: jest.fn().mockResolvedValue({ paymentCredentials: { bepaid: encryptCredentials({ provider: 'bepaid', shopId: 'shop', secret: 'sensitive-secret', environment: 'TEST' }, secret) } }) } },
      forTenant: jest.fn(() => ({
        order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1', status: 'SERVED', isPaid: false, totalAmountByn: '8.25' }) },
        payment: { findFirst: jest.fn().mockResolvedValue(null), create: paymentCreate, update: paymentUpdate },
      })),
    };
    const client = { createCheckout: jest.fn().mockRejectedValue(new BadGatewayException('Платёжный сервис временно недоступен')) };
    const service = new GuestSessionService(prisma as never, {} as never, { enqueue: jest.fn() }, client as never);
    const previous = process.env.PAYMENT_CREDENTIALS_SECRET;
    process.env.PAYMENT_CREDENTIALS_SECRET = secret;

    await expect(service.createCardPayment('order-1', 'tenant-1', 'table-1')).rejects.toMatchObject({ message: 'Платёжный сервис временно недоступен' });
    expect(paymentUpdate).toHaveBeenCalledWith({ where: { id: 'payment-1' }, data: { status: 'FAILED' } });
    expect(JSON.stringify(paymentUpdate.mock.calls)).not.toContain('sensitive-secret');

    if (previous === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
    else process.env.PAYMENT_CREDENTIALS_SECRET = previous;
  });
});
