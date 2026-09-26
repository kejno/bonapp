import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MenuGateway } from '../menu/menu.gateway';

export type WaiterCallReason = 'NEED_BILL' | 'CALL_STAFF';

@Injectable()
export class WaiterCallService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MenuGateway,
  ) {}

  async call(tenantId: string, tableId: string, reason: WaiterCallReason) {
    if (reason !== 'NEED_BILL' && reason !== 'CALL_STAFF') {
      throw new BadRequestException('reason must be NEED_BILL or CALL_STAFF');
    }
    const table = await this.prisma.forTenant(tenantId).table.findUnique({
      where: { id: tableId },
      select: { tableNumber: true },
    });
    if (!table) throw new BadRequestException('Table is not available');
    this.gateway.emitWaiterCalled(tenantId, {
      tableId,
      tableNumber: table.tableNumber,
      reason,
    });
    return { success: true };
  }
}
