import { PaymentsService } from './payments.service';

describe('BNP-512 duplicate payment webhook', () => {
  it('applies the payment and order transition once when the same event is delivered twice', async () => {
    const payment = { id: 'p1', orderId: 'o1', tenantId: 't1', provider: 'ERIP_EPOS', status: 'PENDING', order: { tableId: 'table-1', guestSessionId: null } };
    const tx = { payment: { updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }) }, order: { update: jest.fn() } };
    const prisma = { forTenant: () => ({ payment: { findUnique: jest.fn().mockResolvedValue(payment) } }), transactionForTenant: jest.fn((_tenant: string, work: (trx: typeof tx) => unknown) => Promise.resolve(work(tx))) };
    const service = new PaymentsService(prisma as never, { get: (_key: string, fallback?: string) => fallback } as never, {} as never, undefined, { emitPaymentStatusChanged: jest.fn() } as never);
    const event = { paymentId: 'p1', tenantId: 't1', status: 'confirmed' };
    await service.process('ERIP', event);
    await service.process('ERIP', event);
    expect(tx.payment.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.order.update).toHaveBeenCalledTimes(1);
  });
});
