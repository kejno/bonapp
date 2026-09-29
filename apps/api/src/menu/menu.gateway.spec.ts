import { MenuGateway } from './menu.gateway';

describe('MenuGateway payment notifications', () => {
  it('notifies every active table session when a payment changes', async () => {
    const emitted: string[] = [];
    const io = {
      to: (room: string) => ({ emit: () => { emitted.push(room); } }),
    };
    const prisma = {
      forTenant: () => ({ tableSession: { findMany: jest.fn().mockResolvedValue([{ id: 'session-a' }, { id: 'session-b' }]) } }),
    };
    const gateway = new MenuGateway({} as never, prisma as never, {} as never, {} as never);
    (gateway as unknown as { io: typeof io }).io = io;

    gateway.emitPaymentStatusChanged('tenant-1', 'table-1', 'guest-session-1', {
      orderId: 'order-1', paymentId: 'payment-1', status: 'COMPLETED', method: 'ERIP',
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(emitted).toEqual(['tenant:tenant-1', 'table:session-a', 'table:session-b']);
  });
});
