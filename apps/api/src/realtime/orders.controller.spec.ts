import { OrdersController } from './orders.controller';
import { ForbiddenException } from '@nestjs/common';

describe('OrdersController', () => {
  it('emits status_changed after updating the order', async () => {
    const order = { id: 'order-1', tenantId: 'tenant-1', status: 'READY' };
    const orderService = { updateStatus: jest.fn().mockResolvedValue(order) };
    const gateway = { emitOrderStatusChanged: jest.fn() };
    const staffAuthService = {
      authenticate: jest
        .fn()
        .mockReturnValue({ tenantId: 'tenant-1', role: 'kitchen' }),
    };
    const controller = new OrdersController(
      orderService as never,
      gateway as never,
      staffAuthService as never,
    );

    await expect(
      controller.updateStatus(
        'order-1',
        { status: 'READY' },
        'Bearer staff-token',
      ),
    ).resolves.toEqual(order);
    expect(gateway.emitOrderStatusChanged).toHaveBeenCalledWith(order);
  });

  it('rejects a status update from staff outside the kitchen', async () => {
    const orderService = { updateStatus: jest.fn() };
    const gateway = { emitOrderStatusChanged: jest.fn() };
    const staffAuthService = {
      authenticate: jest
        .fn()
        .mockReturnValue({ tenantId: 'tenant-1', role: 'hall' }),
    };
    const controller = new OrdersController(
      orderService as never,
      gateway as never,
      staffAuthService as never,
    );

    await expect(
      controller.updateStatus(
        'order-1',
        { status: 'READY' },
        'Bearer staff-token',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(orderService.updateStatus).not.toHaveBeenCalled();
  });
});
