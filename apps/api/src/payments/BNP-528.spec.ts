import { PaymentsService } from './payments.service';

describe('BNP-528 bePaid checkout creation', () => {
  it('returns the provider checkout URL and records the pending payment', async () => {
    const db = {
      order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1', isPaid: false, totalAmountByn: 25, guestSessionId: null }) },
      payment: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'payment-1' }), update: jest.fn().mockResolvedValue({ id: 'payment-1', eripOrderNumber: null }) },
    };
    const gateway = { create: jest.fn().mockResolvedValue({ id: 'txn-1', checkoutUrl: 'https://checkout.example/session' }) };
    const service = new PaymentsService({ forTenant: () => db } as never, gateway as never, { registerHandler: jest.fn() } as never, {} as never);
    await expect(service.initiate('order-1', 'tenant-1', 'table-1', 'BEPAID')).resolves.toEqual({ paymentId: 'payment-1', checkoutUrl: 'https://checkout.example/session' });
    expect(db.payment.create).toHaveBeenCalledTimes(1);
  });
});
