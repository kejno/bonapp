import { PaymentsService } from './payments.service';

describe('BNP-529 failed payment webhook', () => {
  it('marks the payment failed without marking the order paid', async () => {
    const payment = { id: 'p1', orderId: 'o1', tenantId: 't1', provider: 'ERIP_EPOS', status: 'PENDING', order: { tableId: 'table-1', guestSessionId: null } };
    const tx = { payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, order: { update: jest.fn() } };
    const prisma = { forTenant: () => ({ payment: { findUnique: jest.fn().mockResolvedValue(payment) } }), transactionForTenant: jest.fn((_tenant: string, work: (trx: typeof tx) => unknown) => Promise.resolve(work(tx))) };
    const socket = { emitPaymentStatusChanged: jest.fn() };
    const service = new PaymentsService(prisma as never, {} as never, { registerHandler: jest.fn() } as never, socket as never);
    await service.process('ERIP', { paymentId: 'p1', tenantId: 't1', status: 'failed' });
    expect(tx.payment.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: 'PENDING' },
      data: { status: 'FAILED', payload: { paymentId: 'p1', tenantId: 't1', status: 'failed' } },
    });
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(socket.emitPaymentStatusChanged).toHaveBeenCalledWith('t1', 'table-1', null, {
      orderId: 'o1',
      paymentId: 'p1',
      status: 'FAILED',
      method: 'ERIP',
    });
    expect(socket.emitPaymentStatusChanged).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ status: 'COMPLETED' }),
    );
  });
});
