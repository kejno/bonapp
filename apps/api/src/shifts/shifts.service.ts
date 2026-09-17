import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ShiftStatus, StaffRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const openingRoles: StaffRole[] = [StaffRole.CASHIER, StaffRole.MANAGER];

@Injectable()
export class ShiftsService {
  private readonly logger = new Logger(ShiftsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async current(tenantId: string) {
    return this.prisma.shift.findFirst({
      where: { tenantId, status: ShiftStatus.OPEN },
    });
  }

  async open(tenantId: string, cashierId: string) {
    return this.prisma.$transaction(async (tx) => {
      const openShift = await tx.shift.findFirst({
        where: { tenantId, status: ShiftStatus.OPEN },
      });
      if (openShift)
        throw new ConflictException('A shift is already open for this tenant');
      const cashier = await tx.staff.findFirst({
        where: { id: cashierId, tenantId, isActive: true },
      });
      if (!cashier) throw new NotFoundException('Cashier not found');
      if (!openingRoles.includes(cashier.role)) {
        throw new ForbiddenException(
          'Only a cashier or manager can open a shift',
        );
      }
      await tx.tenant.update({
        where: { id: tenantId },
        data: { dailyOrderNumber: 0 },
      });
      const shift = await tx.shift.create({
        data: { tenantId, cashierId, status: ShiftStatus.OPEN },
      });
      this.logger.log(`[СКНО STUB] shift open – tenantId: ${tenantId}`);
      return shift;
    });
  }

  async close(tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      const shift = await tx.shift.findFirst({
        where: { tenantId, status: ShiftStatus.OPEN },
      });
      if (!shift) throw new NotFoundException('No active shift found');
      const totals = await tx.order.aggregate({
        where: { tenantId, shiftId: shift.id },
        _sum: { totalAmount: true },
        _count: { id: true },
      });
      const closedAt = new Date();
      const closedShift = await tx.shift.update({
        where: { id: shift.id },
        data: { status: ShiftStatus.CLOSED, closedAt },
      });
      const report = await tx.shiftReport.create({
        data: {
          shiftId: shift.id,
          cashierId: shift.cashierId,
          openedAt: shift.openedAt,
          closedAt,
          totalAmount: totals._sum.totalAmount ?? 0,
          orderCount: totals._count.id,
        },
      });
      await tx.tenant.update({
        where: { id: tenantId },
        data: { dailyOrderNumber: 0 },
      });
      this.logger.log(`[СКНО STUB] shift close – tenantId: ${tenantId}`);
      return { ...closedShift, report };
    });
  }
}
