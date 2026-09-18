import { NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const order = {
    id: 'order-1',
    dailyOrderNumber: 48,
    status: 'PREPARING',
    estimatedReadyAt: new Date('2026-09-18T12:15:00.000Z'),
  };

  it('returns the guest order snapshot', async () => {
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
    };
    const service = new OrdersService(prisma as never);

    await expect(service.findSnapshot('order-1')).resolves.toEqual({
      orderId: 'order-1',
      dailyOrderNumber: 48,
      status: 'PREPARING',
      estimatedReadyAt: '2026-09-18T12:15:00.000Z',
    });
  });

  it('rejects an unknown order', async () => {
    const prisma = { order: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new OrdersService(prisma as never);

    await expect(service.findSnapshot('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
