import { PaymentsService } from './payments.service';

describe('BNP-510 successful payment webhook', () => {
  it('completes a pending payment and marks its order paid only for successful status', async () => {
    let orderUpdateArgs: unknown;
    const payment = { id: 'p1', orderId: 'o1', tenantId: 't1', provider: 'ERIP_EPOS', status: 'PENDING', order: { tableId: 'table-1', guestSessionId: null } };
    const tx = {
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      order: { update: jest.fn((args: unknown) => { orderUpdateArgs = args; }) },
    };
    const prisma = { forTenant: () => ({ payment: { findUnique: jest.fn().mockResolvedValue(payment) } }), transactionForTenant: jest.fn((_tenant: string, work: (trx: typeof tx) => unknown) => Promise.resolve(work(tx))) };
    const socket = { emitPaymentStatusChanged: jest.fn() };
    const service = new PaymentsService(prisma as never, {} as never, { registerHandler: jest.fn() } as never, socket as never);
    await service.process('ERIP', { paymentId: 'p1', tenantId: 't1', status: 'confirmed' });
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: 'PENDING' },
      data: { status: 'COMPLETED', payload: { paymentId: 'p1', tenantId: 't1', status: 'confirmed' } },
    });
    expect(tx.order.update).toHaveBeenCalledTimes(1);
    const orderUpdate = orderUpdateArgs as {
      where: { id_tenantId: { id: string; tenantId: string } };
      data: { isPaid: boolean; paidAt: unknown };
    };
    expect(orderUpdate.where).toEqual({ id_tenantId: { id: 'o1', tenantId: 't1' } });
    expect(orderUpdate.data.isPaid).toBe(true);
    expect(orderUpdate.data.paidAt).toBeInstanceOf(Date);
    expect(socket.emitPaymentStatusChanged).toHaveBeenCalledWith('t1', 'table-1', null, {
      orderId: 'o1',
      paymentId: 'p1',
      status: 'COMPLETED',
      method: 'ERIP',
    });
  });
});
