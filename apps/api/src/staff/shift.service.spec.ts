import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftService } from './shift.service';

describe('ShiftService', () => {
  it('converts a concurrent open-shift unique conflict to HTTP 409', async () => {
    const prisma = {
      transactionForTenant: jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      ),
    };
    const service = new ShiftService(prisma as unknown as PrismaService);

    await expect(service.open('tenant-1', 'cashier-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects opening a second shift for a tenant with an active shift', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'shift-1' });
    const tx = { shift: { findFirst }, user: { findFirst: jest.fn() } };
    const transactionForTenant = jest.fn(
      (
        _tenantId: string,
        operation: (tx: {
          shift: { findFirst: () => Promise<unknown> };
          user: { findFirst: () => Promise<unknown> };
        }) => Promise<unknown>,
      ) =>
        operation(tx),
    );
    const prisma = { transactionForTenant } as unknown as PrismaService;
    const service = new ShiftService(prisma, { log: jest.fn() });

    await expect(service.open('tenant-1', 'cashier-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.user.findFirst).not.toHaveBeenCalled();
  });
});
