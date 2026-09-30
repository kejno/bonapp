import { PaymentsService } from './payments.service';

describe('BNP-536 duplicate successful ERIP webhook', () => {
  it('confirms the provider status and completes the payment and order only once', async () => {
    const payment = { id: 'payment-1', orderId: 'order-1', tenantId: 'tenant-1', provider: 'ERIP_EPOS', status: 'PENDING', order: { tableId: 'table-1', guestSessionId: null } };
    const tx = { payment: { updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }) }, order: { update: jest.fn() } };
    const prisma = { forTenant: () => ({ payment: { findUnique: jest.fn().mockResolvedValue(payment) } }), transactionForTenant: jest.fn((_tenant: string, work: (trx: typeof tx) => unknown) => Promise.resolve(work(tx))) };
    const gateway = { getEripPayment: jest.fn().mockResolvedValue({ status: 'successful' }) };
    const socket = { emitPaymentStatusChanged: jest.fn() };
    const service = new PaymentsService(prisma as never, gateway as never, { registerHandler: jest.fn() } as never, socket as never);
    const webhook = { uid: 'provider-1', status: 'successful', tenantId: 'tenant-1', paymentId: 'payment-1' };

    await service.process('ERIP', webhook);
    await service.process('ERIP', webhook);

    expect(gateway.getEripPayment).toHaveBeenCalledTimes(2);
    expect(tx.payment.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.order.update).toHaveBeenCalledTimes(1);
    expect(socket.emitPaymentStatusChanged).toHaveBeenCalledTimes(1);
  });
});
