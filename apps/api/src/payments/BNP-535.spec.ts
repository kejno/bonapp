import { PaymentsService } from './payments.service';

describe('BNP-535 bePaid ERIP failure handling', () => {
  it('marks a pending payment failed if creating the provider request fails', async () => {
    const providerError = new Error('provider unavailable');
    const db = {
      order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1', isPaid: false, totalAmountByn: 25, guestSessionId: null }) },
      payment: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'payment-1' }), update: jest.fn().mockResolvedValue({ id: 'payment-1', status: 'FAILED' }) },
    };
    const gateway = { create: jest.fn().mockRejectedValue(providerError) };
    const service = new PaymentsService({ forTenant: () => db } as never, gateway as never, { registerHandler: jest.fn() } as never, {} as never);

    await expect(service.initiate('order-1', 'tenant-1', 'table-1', 'ERIP')).rejects.toBe(providerError);
    expect(db.payment.update).toHaveBeenCalledWith({ where: { id: 'payment-1' }, data: { status: 'FAILED' } });
    expect(providerError.message).not.toContain('secret');
  });
});
