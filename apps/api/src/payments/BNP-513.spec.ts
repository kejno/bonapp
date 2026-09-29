import { PaymentsService } from './payments.service';

describe('BNP-513 bePaid checkout failure', () => {
  it('marks the pending payment failed when checkout creation fails', async () => {
    const db = {
      order: { findFirst: jest.fn().mockResolvedValue({ id: 'o1', isPaid: false, totalAmountByn: 10, guestSessionId: null }) },
      payment: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'p1' }), update: jest.fn().mockResolvedValue({}) },
    };
    const gateway = { create: jest.fn().mockRejectedValue(new Error('provider unavailable')) };
    const service = new PaymentsService({ forTenant: () => db } as never, gateway as never, { registerHandler: jest.fn() } as never, {} as never);
    await expect(service.initiate('o1', 't1', 'table-1', 'BEPAID')).rejects.toThrow('provider unavailable');
    expect(db.payment.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { status: 'FAILED' } });
  });
});
