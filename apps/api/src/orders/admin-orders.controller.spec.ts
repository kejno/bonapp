import { BadRequestException } from '@nestjs/common';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersService } from './orders.service';

describe('AdminOrdersController', () => {
  const ordersService = { create: jest.fn(), findActive: jest.fn(), changeStatus: jest.fn(), findOne: jest.fn() };
  const controller = new AdminOrdersController(ordersService as unknown as OrdersService);

  beforeEach(() => jest.clearAllMocks());

  it('creates an administrator order for the requested table', async () => {
    ordersService.create.mockResolvedValue({ id: 'order-1' });

    await expect(controller.create({ tableId: ' table-1 ', phone: '29 123 45 67' })).resolves.toEqual({ id: 'order-1' });
    expect(ordersService.create).toHaveBeenCalledWith('table-1', '29 123 45 67');
  });

  it('rejects administrator order requests without a table id', () => {
    expect(() => controller.create({ tableId: 'table-1' })).toThrow(BadRequestException);
    expect(ordersService.create).not.toHaveBeenCalled();
  });
});
