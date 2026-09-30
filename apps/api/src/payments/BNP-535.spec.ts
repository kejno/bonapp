import { PaymentsService } from './payments.service';

describe('BNP-535 bePaid ERIP failure handling', () => {
  it('fails a payment without a provider transaction and allows a retry', async () => {
    const providerError = new Error('provider unavailable');
    const payments: Array<{ id: string; status: string; providerTransactionId?: string }> = [];
    const db = {
      order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1', isPaid: false, totalAmountByn: 25, guestSessionId: null }) },
      payment: {
        findFirst: jest.fn(() => Promise.resolve(payments.find((payment) => payment.status === 'PENDING') ?? null)),
        create: jest.fn(() => {
          const payment = { id: `payment-${payments.length + 1}`, status: 'PENDING' };
          payments.push(payment);
          return Promise.resolve(payment);
        }),
        update: jest.fn(({ where, data }: { where: { id: string }; data: { status: string; providerTransactionId?: string } }) => {
          const payment = payments.find((item) => item.id === where.id);
          if (payment) Object.assign(payment, data);
          return Promise.resolve(payment);
        }),
      },
    };
    const gateway = { create: jest.fn().mockRejectedValueOnce(providerError).mockResolvedValueOnce({ id: 'provider-transaction-2', eripOrderNumber: '000000000042' }) };
    const service = new PaymentsService({ forTenant: () => db } as never, gateway as never, { registerHandler: jest.fn() } as never, {} as never);

    await expect(service.initiate('order-1', 'tenant-1', 'table-1', 'ERIP')).rejects.toBe(providerError);

    expect(payments).toEqual([{ id: 'payment-1', status: 'FAILED' }]);
    expect(payments.some((payment) => payment.status === 'PENDING' && !payment.providerTransactionId)).toBe(false);

    await expect(service.initiate('order-1', 'tenant-1', 'table-1', 'ERIP')).resolves.toEqual({ paymentId: 'payment-2', erip_order_number: '000000000042' });
    expect(gateway.create).toHaveBeenCalledTimes(2);
    expect(payments).toMatchObject([
      { id: 'payment-1', status: 'FAILED' },
      { id: 'payment-2', status: 'PENDING', providerTransactionId: 'provider-transaction-2' },
    ]);
  });
});
