import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StaffService } from './staff.service';

describe('StaffService.openShift', () => {
  it('reports a conflict when another request has already opened a shift', async () => {
    const prisma = {
      transactionForTenant: jest.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })),
    };
    const tenant = { getTenantId: () => 'tenant-1' };
    const service = new StaffService(prisma as never, tenant as never);

    await expect(service.openShift('cashier-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.transactionForTenant).toHaveBeenCalledWith('tenant-1', expect.any(Function));
  });
});
