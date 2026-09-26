import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, TableStatus } from '@prisma/client';
import { TenantContextService } from '../tenant/tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findAll() {
    const tenantId = this.tenantContext.getTenantId();
    return this.prisma.db.order.findMany({ where: { tenantId } });
  }

  async findOne(id: string) {
    const tenantId = this.tenantContext.getTenantId();
    const order = await this.prisma.db.order.findFirst({ where: { id } });
    if (!order || order.tenantId !== tenantId) {
      throw new ForbiddenException();
    }
    return order;
  }

  async create(tableId: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new ForbiddenException();

    return this.prisma.transactionForTenant(tenantId, async (tx) => {
      const table = await tx.table.findFirst({ where: { id: tableId } });
      if (!table) throw new NotFoundException(`Table ${tableId} not found`);
      const reservation = await tx.table.updateMany({
        where: { id: tableId, tenantId, status: TableStatus.AVAILABLE },
        data: { status: TableStatus.OCCUPIED },
      });
      if (reservation.count !== 1) {
        throw new ConflictException('Table is not available');
      }
      const tenant = await tx.tenant.update({
        where: { id: tenantId },
        data: { dailyOrderNumber: { increment: 1 } },
        select: { dailyOrderNumber: true },
      });
      const dailyOrderNumber = tenant.dailyOrderNumber;
      const order = await tx.order.create({
        data: { tenantId, tableId, dailyOrderNumber },
      });
      return order;
    });
  }

  async pay(id: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new ForbiddenException();

    return this.prisma.transactionForTenant(tenantId, async (tx) => {
      const order = await tx.order.findFirst({ where: { id, tenantId } });
      if (!order) throw new NotFoundException(`Order ${id} not found`);
      if (order.isPaid || order.status === OrderStatus.PAID) {
        throw new ConflictException('Order is already paid');
      }

      const paidOrder = await tx.order.update({
        where: { id_tenantId: { id, tenantId } },
        data: { isPaid: true, status: OrderStatus.PAID, paidAt: new Date() },
      });
      await tx.table.update({
        where: { id_tenantId: { id: order.tableId, tenantId } },
        data: { status: TableStatus.AVAILABLE },
      });
      return paidOrder;
    });
  }
}
