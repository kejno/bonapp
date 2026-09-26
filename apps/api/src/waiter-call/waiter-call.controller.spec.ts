import { BadRequestException } from '@nestjs/common';
import { WaiterCallController } from './waiter-call.controller';

describe('WaiterCallController', () => {
  const waiterCallService = { call: jest.fn() };
  const controller = new WaiterCallController(waiterCallService as never);
  beforeEach(() => jest.clearAllMocks());

  it('uses table and tenant identity from the QR session', async () => {
    waiterCallService.call.mockResolvedValue({ success: true });
    await controller.call({ tableId: 'trusted-table', tenantId: 'trusted-tenant' } as never, {
      tableId: 'spoofed-table', reason: 'NEED_BILL',
    });
    expect(waiterCallService.call).toHaveBeenCalledWith('trusted-tenant', 'trusted-table', 'NEED_BILL');
  });

  it.each([{}, null, { reason: 'UNKNOWN' }])('rejects invalid request body %p', async (body) => {
    await expect(Promise.resolve().then(() => controller.call({ tableId: 'table', tenantId: 'tenant' } as never, body)))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(waiterCallService.call).not.toHaveBeenCalled();
  });
});
