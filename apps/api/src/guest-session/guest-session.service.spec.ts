import { ConflictException, ForbiddenException } from '@nestjs/common';
import { encryptCredentials } from '../tenant/payment-credentials';
import { PrismaService } from '../prisma/prisma.service';
import { GuestSessionService } from './guest-session.service';

describe('GuestSessionService order status', () => {
  const findFirst = jest.fn();
  const forTenant = jest.fn(() => ({ order: { findFirst } }));
  const prisma = {
    forTenant,
  } as unknown as PrismaService;
  const service = new GuestSessionService(prisma, { emitKitchenOrder: jest.fn() } as never, { enqueue: jest.fn() });

  beforeEach(() => jest.clearAllMocks());

  it('returns the guest safe order snapshot and a cooking estimate', async () => {
    const updatedAt = new Date('2026-09-26T12:00:00.000Z');
    findFirst.mockResolvedValue({ id: 'order-1', dailyOrderNumber: 48, status: 'COOKING', totalAmountByn: 42.5, updatedAt });

    await expect(service.getOrderStatus('order-1', 'tenant-1', 'table-1')).resolves.toEqual({
      id: 'order-1', dailyOrderNumber: 48, status: 'COOKING', totalAmountByn: 42.5,
      estimatedReadyAt: '2026-09-26T12:12:00.000Z',
      updatedAt: '2026-09-26T12:00:00.000Z',
    });
    expect(forTenant).toHaveBeenCalledWith('tenant-1');
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'order-1', tableId: 'table-1' },
      select: { id: true, dailyOrderNumber: true, status: true, totalAmountByn: true, updatedAt: true },
    });
  });

  it('does not expose an order associated with a different table', async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.getOrderStatus('order-1', 'tenant-1', 'table-2')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('GuestSessionService card payment status', () => {
  it('exposes the server-side checkout expiry derived from payment creation time', async () => {
    const createdAt = new Date('2026-09-29T12:00:00.000Z');
    const prisma = {
      forTenant: jest.fn(() => ({
        order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1', status: 'SERVED' }) },
        payment: { findFirst: jest.fn().mockResolvedValue({ status: 'PENDING', createdAt }) },
      })),
      db: { tenant: { findUnique: jest.fn().mockResolvedValue({ paymentCredentials: null }) } },
    } as unknown as PrismaService;
    const service = new GuestSessionService(prisma, { emitKitchenOrder: jest.fn() } as never, { enqueue: jest.fn() });

    await expect(service.getCardPaymentStatus('order-1', 'tenant-1', 'table-1')).resolves.toEqual({
      orderStatus: 'SERVED',
      paymentStatus: 'PENDING',
      paymentExpiresAt: '2026-09-29T12:15:00.000Z',
      paymentEnabled: false,
    });
  });
});

describe('GuestSessionService createCardPayment', () => {
  const paymentFindFirst = jest.fn();
  const paymentUpdateMany = jest.fn();
  const paymentCreate = jest.fn();
  const paymentUpdate = jest.fn();
  const secret = 'payment-test-secret';
  const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;
  const prisma = {
    db: { tenant: { findUnique: jest.fn().mockResolvedValue({ paymentCredentials: { bepaid: encryptCredentials({ provider: 'bepaid', shopId: 'shop', secret: 'gateway-secret', environment: 'TEST' }, secret) } }) } },
    forTenant: jest.fn(() => ({
      order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1', status: 'SERVED', isPaid: false, totalAmountByn: 12 }) },
      payment: { findFirst: paymentFindFirst, updateMany: paymentUpdateMany, create: paymentCreate, update: paymentUpdate },
    })),
  } as unknown as PrismaService;
  const client = { createCheckout: jest.fn().mockResolvedValue({ token: 'token', redirectUrl: 'https://checkout.test' }) };
  const service = new GuestSessionService(prisma, { emitKitchenOrder: jest.fn() } as never, { enqueue: jest.fn() }, client);

  beforeEach(() => {
    process.env.PAYMENT_CREDENTIALS_SECRET = secret;
    jest.clearAllMocks();
    paymentFindFirst.mockImplementation((args: { where: { createdAt?: unknown } }) =>
      args.where.createdAt ? null : { id: 'old-payment', status: 'PENDING', createdAt: new Date(Date.now() - 16 * 60_000) },
    );
    paymentUpdateMany.mockResolvedValue({ count: 1 });
    paymentCreate.mockResolvedValue({ id: 'new-payment', amountByn: '12.00' });
    paymentUpdate.mockResolvedValue({});
  });

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
    else process.env.PAYMENT_CREDENTIALS_SECRET = previousSecret;
  });

  it('cancels an expired pending payment before creating a new checkout', async () => {
    await service.createCardPayment('order-1', 'tenant-1', 'table-1');

    expect(paymentUpdateMany).toHaveBeenCalledWith({
      where: { id: 'old-payment', status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    expect(paymentCreate).toHaveBeenCalledWith({ data: {
      tenantId: 'tenant-1', orderId: 'order-1', amountByn: 12, tipsAmountByn: 0,
      provider: 'bepaid', method: 'BANK_CARD', status: 'PENDING',
    } });
  });

  it('returns a conflict when another request wins the pending-payment race', async () => {
    paymentUpdateMany.mockResolvedValue({ count: 0 });

    await expect(service.createCardPayment('order-1', 'tenant-1', 'table-1')).rejects.toBeInstanceOf(ConflictException);
    expect(paymentCreate).not.toHaveBeenCalled();
    expect(client.createCheckout).not.toHaveBeenCalled();
  });
});

describe('GuestSessionService addOrderItem', () => {
  const lifecycle: string[] = [];
  const create = jest.fn();
  const update = jest.fn();
  const transaction = {
    order: { findFirst: jest.fn(), update },
    menuItem: { findFirst: jest.fn() },
    orderItem: { create },
  };
  const prisma = {
    transactionForTenant: jest.fn(async (_tenantId: string, work: (tx: typeof transaction) => unknown) => {
      const result = await work(transaction);
      lifecycle.push('commit');
      return result;
    }),
  } as unknown as PrismaService;
  const gateway = { emitKitchenOrder: jest.fn(() => lifecycle.push('emit')) };
  const service = new GuestSessionService(prisma, gateway as never, { enqueue: jest.fn() });

  beforeEach(() => {
    jest.clearAllMocks();
    lifecycle.length = 0;
    transaction.order.findFirst.mockResolvedValue({ id: 'order-1', status: 'COOKING' });
    transaction.menuItem.findFirst.mockResolvedValue({
      id: 'item-1', priceByn: '5.00', kitchenDepartment: 'HOT', stopListItem: null,
    });
    create.mockResolvedValue({ id: 'order-item-1' });
    update.mockResolvedValue({});
  });

  it('places additions at the cooking stage and publishes the KDS update after commit', async () => {
    await service.addOrderItem('order-1', 'item-1', 2, 'tenant-1', 'table-1');

    expect(create).toHaveBeenCalledWith({ data: {
      orderId: 'order-1', itemId: 'item-1', quantity: 2,
      unitPriceByn: '5.00', selectedModifiers: [], status: 'COOKING',
      kitchenDepartment: 'HOT',
    } });
    expect(lifecycle).toEqual(['commit', 'emit']);
    expect(gateway.emitKitchenOrder).toHaveBeenCalledWith('tenant-1', 'order:updated', { id: 'order-1' });
  });
});
