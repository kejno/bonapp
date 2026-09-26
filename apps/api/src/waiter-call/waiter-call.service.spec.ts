import { BadRequestException } from '@nestjs/common';
import { WaiterCallService } from './waiter-call.service';

describe('WaiterCallService', () => {
  const tableFindUnique = jest.fn();
  const prisma = { forTenant: jest.fn(() => ({ table: { findUnique: tableFindUnique } })) };
  const gateway = { emitWaiterCalled: jest.fn() };
  const service = new WaiterCallService(prisma as never, gateway as never);
  beforeEach(() => jest.clearAllMocks());

  it.each(['NEED_BILL', 'CALL_STAFF'] as const)('emits a %s event with table details', async (reason) => {
    tableFindUnique.mockResolvedValue({ tableNumber: 4 });
    await expect(service.call('tenant-1', 'table-1', reason)).resolves.toEqual({ success: true });
    expect(prisma.forTenant).toHaveBeenCalledWith('tenant-1');
    expect(tableFindUnique).toHaveBeenCalledWith({ where: { id: 'table-1' }, select: { tableNumber: true } });
    expect(gateway.emitWaiterCalled).toHaveBeenCalledWith('tenant-1', {
      tableId: 'table-1', tableNumber: 4, reason,
    });
  });

  it('does not emit when the table is unavailable', async () => {
    tableFindUnique.mockResolvedValue(null);
    await expect(service.call('tenant-1', 'table-1', 'NEED_BILL')).rejects.toBeInstanceOf(BadRequestException);
    expect(gateway.emitWaiterCalled).not.toHaveBeenCalled();
  });
});
