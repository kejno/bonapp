/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ShiftStatus, StaffRole } from '@prisma/client';
import { ShiftsService } from './shifts.service';

describe('ShiftsService', () => {
  const tenantId = 'tenant-1';
  const shift = {
    id: 'shift-1',
    tenantId,
    cashierId: 'staff-1',
    status: ShiftStatus.OPEN,
    openedAt: new Date(),
  };
  let prisma: any;
  let service: ShiftsService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
      shift: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      staff: { findFirst: jest.fn() },
      tenant: { update: jest.fn() },
      order: { aggregate: jest.fn() },
      shiftReport: { create: jest.fn() },
    };
    service = new ShiftsService(prisma);
  });

  it('opens a shift and resets the tenant order counter', async () => {
    prisma.shift.findFirst.mockResolvedValue(null);
    prisma.staff.findFirst.mockResolvedValue({
      id: shift.cashierId,
      role: StaffRole.CASHIER,
    });
    prisma.shift.create.mockResolvedValue(shift);

    await expect(service.open(tenantId, shift.cashierId)).resolves.toEqual(
      shift,
    );
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: tenantId },
      data: { dailyOrderNumber: 0 },
    });
  });

  it('rejects opening a second shift for the same tenant', async () => {
    prisma.shift.findFirst.mockResolvedValue(shift);

    await expect(service.open(tenantId, shift.cashierId)).rejects.toEqual(
      new ConflictException('A shift is already open for this tenant'),
    );
  });

  it('allows only a cashier or manager to open a shift', async () => {
    prisma.shift.findFirst.mockResolvedValue(null);
    prisma.staff.findFirst.mockResolvedValue({
      id: shift.cashierId,
      role: 'WAITER',
    });

    await expect(
      service.open(tenantId, shift.cashierId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('closes an active shift, stores a report, and resets the counter', async () => {
    prisma.shift.findFirst.mockResolvedValue(shift);
    prisma.order.aggregate.mockResolvedValue({
      _sum: { totalAmount: 42.5 },
      _count: { id: 2 },
    });
    prisma.shift.update.mockResolvedValue({
      ...shift,
      status: ShiftStatus.CLOSED,
      closedAt: new Date(),
    });
    prisma.shiftReport.create.mockResolvedValue({
      id: 'report-1',
      totalAmount: 42.5,
      orderCount: 2,
    });

    const result = await service.close(tenantId);
    expect(result.report).toEqual(expect.objectContaining({ orderCount: 2 }));
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: tenantId },
      data: { dailyOrderNumber: 0 },
    });
  });

  it('reports absence of an active shift', async () => {
    prisma.shift.findFirst.mockResolvedValue(null);

    await expect(service.close(tenantId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
