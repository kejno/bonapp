import { ForbiddenException } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

describe('OrdersController', () => {
  const ordersService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    updateStatus: jest.fn(),
  };
  const menuGateway = { emitOrderStatusChanged: jest.fn() };
  const controller = new OrdersController(ordersService as unknown as OrdersService, menuGateway as never);

  beforeEach(() => jest.clearAllMocks());

  describe('findAll()', () => {
    it('delegates to ordersService.findAll and returns results', async () => {
      const orders = [{ id: 'order-1' }, { id: 'order-2' }];
      ordersService.findAll.mockResolvedValue(orders);

      const result = await controller.findAll();

      expect(result).toEqual(orders);
      expect(ordersService.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne()', () => {
    it('delegates to ordersService.findOne with the id param', async () => {
      const order = { id: 'order-1' };
      ordersService.findOne.mockResolvedValue(order);

      const result = await controller.findOne('order-1');

      expect(result).toEqual(order);
      expect(ordersService.findOne).toHaveBeenCalledWith('order-1');
    });

    it('propagates ForbiddenException when order belongs to another tenant', async () => {
      ordersService.findOne.mockRejectedValue(new ForbiddenException());

      await expect(
        controller.findOne('other-tenant-order-id'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('emits the updated order status for connected guests', async () => {
    const order = { id: 'order-1', dailyOrderNumber: 48, status: 'COOKING', updatedAt: new Date() };
    ordersService.updateStatus.mockResolvedValue(order);

    await expect(controller.updateStatus('order-1', { status: 'COOKING' })).resolves.toEqual(order);

    expect(ordersService.updateStatus).toHaveBeenCalledWith('order-1', 'COOKING');
    expect(menuGateway.emitOrderStatusChanged).toHaveBeenCalledWith(order);
  });

  it('rejects unsupported order statuses before updating the order', async () => {
    await expect(controller.updateStatus('order-1', { status: 'INVALID' })).rejects.toThrow('Valid order status is required');
    expect(ordersService.updateStatus).not.toHaveBeenCalled();
  });
});
