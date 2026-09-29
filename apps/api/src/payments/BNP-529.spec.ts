import { createHmac } from 'node:crypto';
import { WebhooksController } from './webhooks.controller';
import { PaymentsService } from './payments.service';

describe('BNP-529 failed payment webhook', () => {
  it('accepts a signed webhook, queues it, and marks the payment failed without marking the order paid', async () => {
    const payment = { id: 'p1', orderId: 'o1', tenantId: 't1', provider: 'ERIP_EPOS', status: 'PENDING', order: { tableId: 'table-1', guestSessionId: null } };
    const tx = { payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, order: { update: jest.fn() } };
    const prisma = { forTenant: () => ({ payment: { findUnique: jest.fn().mockResolvedValue(payment) } }), transactionForTenant: jest.fn((_tenant: string, work: (trx: typeof tx) => unknown) => Promise.resolve(work(tx))) };
    const registered = { consumer: undefined as ((method: 'ERIP', payload: Record<string, unknown>) => Promise<void>) | undefined };
    const queue = {
      registerHandler: (handler: (method: 'ERIP', payload: Record<string, unknown>) => Promise<void>) => {
        registered.consumer = handler;
      },
      add: jest.fn().mockResolvedValue(undefined),
    };
    const socket = { emitPaymentStatusChanged: jest.fn() };
    const service = new PaymentsService(prisma as never, {} as never, queue as never, socket as never);
    const event = { paymentId: 'p1', tenantId: 't1', status: 'failed' };
    const rawBody = Buffer.from(JSON.stringify(event));
    const signature = createHmac('sha256', 'secret').update(rawBody).digest('hex');
    const controller = new WebhooksController(service, { get: () => 'secret' } as never);

    await expect(controller.erip({ body: event, rawBody } as never, signature)).resolves.toEqual({ accepted: true });
    expect(queue.add).toHaveBeenCalledWith('ERIP', event);
    const consumer = registered.consumer;
    if (!consumer) throw new Error('Payment queue handler was not registered');
    await consumer('ERIP', event);

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
