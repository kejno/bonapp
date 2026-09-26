import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GuestSessionService } from './guest-session.service';

describe('GuestSessionService order status', () => {
  const findFirst = jest.fn();
  const forTenant = jest.fn(() => ({ order: { findFirst } }));
  const prisma = {
    forTenant,
  } as unknown as PrismaService;
  const service = new GuestSessionService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('returns the guest safe order snapshot and a cooking estimate', async () => {
    const updatedAt = new Date('2026-09-26T12:00:00.000Z');
    findFirst.mockResolvedValue({ id: 'order-1', dailyOrderNumber: 48, status: 'COOKING', updatedAt });

    await expect(service.getOrderStatus('order-1', 'tenant-1', 'table-1')).resolves.toEqual({
      id: 'order-1', dailyOrderNumber: 48, status: 'COOKING',
      estimatedReadyAt: '2026-09-26T12:12:00.000Z',
    });
    expect(forTenant).toHaveBeenCalledWith('tenant-1');
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'order-1', tableId: 'table-1' },
      select: { id: true, dailyOrderNumber: true, status: true, updatedAt: true },
    });
  });

  it('does not expose an order associated with a different table', async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.getOrderStatus('order-1', 'tenant-1', 'table-2')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
