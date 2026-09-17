import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftDto, CloseShiftResultDto } from '@bonapp/shared-types';
import { OpenShiftDto } from './dto/open-shift.dto';

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrent(tenantId: string): Promise<ShiftDto | null> {
    const shift = await this.prisma.shift.findFirst({
      where: { tenantId, closedAt: null },
      include: { cashier: true, orders: true },
    });
    if (!shift) return null;
    return this.toDto(shift);
  }

  async open(tenantId: string, dto: OpenShiftDto): Promise<ShiftDto> {
    const existing = await this.prisma.shift.findFirst({
      where: { tenantId, closedAt: null },
    });
    if (existing) throw new BadRequestException('A shift is already open');

    const cashier = await this.prisma.staffMember.findFirst({
      where: { id: dto.cashierId, tenantId },
    });
    if (!cashier) throw new NotFoundException(`Cashier ${dto.cashierId} not found`);

    const shift = await this.prisma.shift.create({
      data: { tenantId, cashierId: dto.cashierId },
      include: { cashier: true, orders: true },
    });
    return this.toDto(shift);
  }

  async close(tenantId: string, id: string): Promise<CloseShiftResultDto> {
    const shift = await this.prisma.shift.findFirst({
      where: { id, tenantId, closedAt: null },
    });
    if (!shift) throw new NotFoundException(`Open shift ${id} not found`);

    const closedAt = new Date();
    const [updated, summary] = await Promise.all([
      this.prisma.shift.update({
        where: { id },
        data: { closedAt },
        include: { cashier: true },
      }),
      this.prisma.order.aggregate({
        where: { tenantId, shiftId: id, status: 'PAID' },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
    ]);

    return {
      id: updated.id,
      openedAt: updated.openedAt.toISOString(),
      closedAt: updated.closedAt!.toISOString(),
      cashier: { id: updated.cashier.id, name: updated.cashier.name },
      ordersCount: summary._count._all,
      totalRevenue: Number(summary._sum.totalAmount ?? 0),
    };
  }

  private toDto(shift: {
    id: string;
    openedAt: Date;
    closedAt: Date | null;
    cashier: { id: string; name: string };
    orders: unknown[];
  }): ShiftDto {
    return {
      id: shift.id,
      openedAt: shift.openedAt.toISOString(),
      closedAt: shift.closedAt?.toISOString() ?? null,
      cashier: { id: shift.cashier.id, name: shift.cashier.name },
      ordersCount: shift.orders.length,
    };
  }
}
