import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WaiterCallReason } from '@bonapp/shared-types';
import { WaiterCallService } from './waiter-call.service';

describe('WaiterCallService', () => {
  const tableId = 'table-id';
  const tenantId = 'tenant-id';
  const gateway = { emitWaiterCalled: jest.fn() };
  const prisma = {
    table: {
      findFirst: jest.fn(),
    },
  };
  const service = new WaiterCallService(prisma as never, gateway as never);

  beforeEach(() => jest.clearAllMocks());

  it('emits a call to the tenant hall with the table number from the authenticated table', async () => {
    prisma.table.findFirst.mockResolvedValue({ id: tableId, number: 4 });

    await service.callWaiter({ tenantId, tableId }, WaiterCallReason.NEED_BILL);

    expect(prisma.table.findFirst).toHaveBeenCalledWith({
      where: { id: tableId, tenantId },
      select: { number: true },
    });
    expect(gateway.emitWaiterCalled).toHaveBeenCalledWith(tenantId, {
      tableId,
      tableNumber: 4,
      reason: WaiterCallReason.NEED_BILL,
    });
  });

  it('rejects a reason outside of the supported set', async () => {
    await expect(
      service.callWaiter({ tenantId, tableId }, 'OTHER' as WaiterCallReason),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not emit a call when the table is outside the token tenant', async () => {
    prisma.table.findFirst.mockResolvedValue(null);

    await expect(
      service.callWaiter({ tenantId, tableId }, WaiterCallReason.CALL_STAFF),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(gateway.emitWaiterCalled).not.toHaveBeenCalled();
  });
});
