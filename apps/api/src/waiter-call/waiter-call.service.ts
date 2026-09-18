import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WaiterCallReason } from '@bonapp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type { TableSession } from './table-session-token.service';
import { WaiterCallGateway } from './waiter-call.gateway';

const validReasons = new Set<string>(Object.values(WaiterCallReason));

@Injectable()
export class WaiterCallService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: WaiterCallGateway,
  ) {}

  async callWaiter(
    session: TableSession,
    reason: WaiterCallReason,
  ): Promise<void> {
    if (!validReasons.has(reason)) {
      throw new BadRequestException('Unsupported waiter call reason');
    }

    const table = await this.prisma.table.findFirst({
      where: { id: session.tableId, tenantId: session.tenantId },
      select: { number: true },
    });
    if (!table) {
      throw new NotFoundException('Table not found');
    }

    this.gateway.emitWaiterCalled(session.tenantId, {
      tableId: session.tableId,
      tableNumber: table.number,
      reason,
    });
  }
}
