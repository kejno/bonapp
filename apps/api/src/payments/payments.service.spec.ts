import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  const gateway = { create: jest.fn(), cancel: jest.fn() };
  const queue = { registerHandler: jest.fn(), add: jest.fn() };
  const socket = { emitPaymentStatusChanged: jest.fn() };
  const db = { order: { findFirst: jest.fn() }, payment: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() } };
  const prisma = { forTenant: jest.fn(() => db), unscopedClient: { payment: { findUnique: jest.fn() } }, transactionForTenant: jest.fn() };
  let service: PaymentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PaymentsService(prisma as never, gateway as never, queue as never, socket as never);
    db.order.findFirst.mockResolvedValue({ id: 'order-1', isPaid: false, totalAmountByn: 12.5, guestSessionId: null });
    db.payment.findFirst.mockResolvedValue(null);
  });

  it('returns the existing checkout session for a repeated request of the same method', async () => {
    db.payment.findFirst.mockResolvedValue({ id: 'payment-1', provider: 'BEPAID', eripOrderNumber: null, payload: { checkoutUrl: 'https://checkout.test/session' } });
    await expect(service.initiate('order-1', 'tenant-1', 'table-1', 'BEPAID')).resolves.toEqual({ paymentId: 'payment-1', checkoutUrl: 'https://checkout.test/session' });
    expect(gateway.create).not.toHaveBeenCalled();
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it('creates a pending payment and checkout session for a new method', async () => {
    db.payment.create.mockResolvedValue({ id: 'payment-2' });
    gateway.create.mockResolvedValue({ id: 'txn-2', checkoutUrl: 'https://checkout.test/new' });
    db.payment.update.mockResolvedValue({ id: 'payment-2', eripOrderNumber: null });
    await expect(service.initiate('order-1', 'tenant-1', 'table-1', 'BEPAID')).resolves.toEqual({ paymentId: 'payment-2', checkoutUrl: 'https://checkout.test/new' });
    expect(db.payment.create).toHaveBeenCalledTimes(1);
    expect(gateway.create).toHaveBeenCalledWith('BEPAID', expect.objectContaining({ orderId: 'order-1', amount: 12.5 }));
  });

  it('does not replace a payment completed while provider cancellation is in flight', async () => {
    const payment = { id: 'payment-1', provider: 'ERIP_EPOS', providerTransactionId: 'erip-1', eripOrderNumber: '123', payload: null };
    db.payment.findFirst.mockResolvedValue(payment);
    let cancellationStarted!: () => void;
    let finishCancellation!: (cancelled: boolean) => void;
    const started = new Promise<void>((resolve) => { cancellationStarted = resolve; });
    gateway.cancel.mockImplementation(() => {
      cancellationStarted();
      return new Promise<boolean>((resolve) => { finishCancellation = resolve; });
    });
    db.payment.updateMany.mockResolvedValue({ count: 0 });

    const switching = service.initiate('order-1', 'tenant-1', 'table-1', 'BEPAID');
    await started;
    finishCancellation(true);

    await expect(switching).rejects.toMatchObject({ status: 409 });
    expect(db.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1', status: 'PENDING' },
      data: { status: 'FAILED' },
    });
    expect(db.payment.create).not.toHaveBeenCalled();
  });
});
