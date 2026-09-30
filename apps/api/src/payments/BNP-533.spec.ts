import { PaymentsService } from './payments.service';

describe('BNP-533 successful ERIP webhook', () => {
  it('confirms success with bePaid before marking the payment and order as paid', async () => {
    const payment = { id: 'payment-1', orderId: 'order-1', tenantId: 'tenant-1', provider: 'ERIP_EPOS', status: 'PENDING', order: { tableId: 'table-1', guestSessionId: null } };
    const tx = { payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, order: { update: jest.fn() } };
    const prisma = { forTenant: () => ({ payment: { findUnique: jest.fn().mockResolvedValue(payment) } }), transactionForTenant: jest.fn((_tenant: string, work: (trx: typeof tx) => unknown) => Promise.resolve(work(tx))) };
    const gateway = { getEripPayment: jest.fn().mockResolvedValue({ status: 'successful' }) };
    const socket = { emitPaymentStatusChanged: jest.fn() };
    const service = new PaymentsService(prisma as never, gateway as never, { registerHandler: jest.fn() } as never, socket as never);

    await service.process('ERIP', { uid: 'provider-1', status: 'successful', tenantId: 'tenant-1', paymentId: 'payment-1' });

    expect(gateway.getEripPayment).toHaveBeenCalledWith('tenant-1', 'provider-1');
    expect(tx.payment.updateMany).toHaveBeenCalledWith({ where: { id: 'payment-1', status: 'PENDING' }, data: { status: 'SUCCEEDED', payload: { uid: 'provider-1', status: 'successful', tenantId: 'tenant-1', paymentId: 'payment-1' } } });
    expect(tx.order.update).toHaveBeenCalledTimes(1);
    expect(socket.emitPaymentStatusChanged).toHaveBeenCalledWith('tenant-1', 'table-1', null, expect.objectContaining({ status: 'SUCCEEDED' }));
  });
});
