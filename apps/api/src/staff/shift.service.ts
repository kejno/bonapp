import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ShiftStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ShiftService {
  private readonly logger: Pick<Logger, 'log'>;
  constructor(
    private readonly prisma: PrismaService,
    logger?: Pick<Logger, 'log'>,
  ) {
    this.logger = logger ?? new Logger(ShiftService.name);
  }

  async current(tenantId: string) {
    return this.prisma
      .forTenant(tenantId)
      .shift.findFirst({
        where: { status: ShiftStatus.OPEN },
        include: { cashier: { select: { id: true, fullName: true } } },
      });
  }

  async open(tenantId: string, cashierId: string) {
    return this.prisma.transactionForTenant(tenantId, async (tx) => {
      const active = await tx.shift.findFirst({
        where: { tenantId, status: ShiftStatus.OPEN },
      });
      if (active)
        throw new ConflictException('A shift is already open for this tenant');
      const cashier = await tx.user.findFirst({
        where: {
          id: cashierId,
          tenantId,
          isActive: true,
          role: { in: ['CASHIER', 'MANAGER'] },
        },
      });
      if (!cashier) throw new NotFoundException('Active cashier not found');
      const shift = await tx.shift.create({ data: { tenantId, cashierId } });
      await tx.tenant.update({
        where: { id: tenantId },
        data: { dailyOrderNumber: 0 },
      });
      this.logger.log(`[СКНО STUB] shift open – tenantId: ${tenantId}`);
      return shift;
    });
  }

  async close(tenantId: string) {
    return this.prisma.transactionForTenant(tenantId, async (tx) => {
      const shift = await tx.shift.findFirst({
        where: { tenantId, status: ShiftStatus.OPEN },
      });
      if (!shift) throw new NotFoundException('No open shift for this tenant');
      const closedAt = new Date();
      const totals = await tx.order.aggregate({
        where: { tenantId, createdAt: { gte: shift.openedAt, lte: closedAt } },
        _sum: { totalAmountByn: true },
        _count: { _all: true },
      });
      const closed = await tx.shift.update({
        where: { id_tenantId: { id: shift.id, tenantId } },
        data: { status: ShiftStatus.CLOSED, closedAt },
      });
      const report = await tx.shiftReport.create({
        data: {
          tenantId,
          shiftId: shift.id,
          cashierId: shift.cashierId,
          openedAt: shift.openedAt,
          closedAt,
          totalAmount: totals._sum.totalAmountByn ?? 0,
          orderCount: totals._count._all,
        },
      });
      await tx.tenant.update({
        where: { id: tenantId },
        data: { dailyOrderNumber: 0 },
      });
      this.logger.log(`[СКНО STUB] shift close – tenantId: ${tenantId}`);
      return { ...closed, report };
    });
  }
}
