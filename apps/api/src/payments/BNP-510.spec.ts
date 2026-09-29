import { PaymentsService } from './payments.service';

describe('BNP-510 successful payment webhook', () => {
  it('completes a pending payment and marks its order paid only for successful status', async () => {
    const payment = { id: 'p1', orderId: 'o1', tenantId: 't1', provider: 'ERIP_EPOS', status: 'PENDING', order: { tableId: 'table-1', guestSessionId: null } };
    const tx = { payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, order: { update: jest.fn() } };
    const prisma = { forTenant: () => ({ payment: { findUnique: jest.fn().mockResolvedValue(payment) } }), transactionForTenant: jest.fn((_tenant: string, work: (trx: typeof tx) => unknown) => Promise.resolve(work(tx))) };
    const socket = { emitPaymentStatusChanged: jest.fn() };
    const service = new PaymentsService(prisma as never, {} as never, { registerHandler: jest.fn() } as never, socket as never);
    await service.process('ERIP', { paymentId: 'p1', tenantId: 't1', status: 'confirmed' });
    expect(tx.payment.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.order.update).toHaveBeenCalledTimes(1);
    expect(socket.emitPaymentStatusChanged).toHaveBeenCalled();
  });
});
