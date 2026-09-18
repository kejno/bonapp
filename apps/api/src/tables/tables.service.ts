import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TableStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AreasService } from '../areas/areas.service';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateTableInput {
  tableNumber: number;
  label?: string;
  seatsCount: number;
  areaId: string;
}

export interface UpdateTableInput {
  tableNumber?: number;
  label?: string;
  seatsCount?: number;
  areaId?: string;
}

export interface BulkCreateTablesInput {
  areaId: string;
  startNumber: number;
  count: number;
  seatsCount: number;
}

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly areasService?: AreasService,
  ) {}

  findAll(tenantId: string) {
    return this.prisma.table.findMany({
      where: { tenantId },
      orderBy: [{ areaId: 'asc' }, { tableNumber: 'asc' }],
    });
  }

  async create(tenantId: string, input: CreateTableInput) {
    await this.ensureAreaExists(tenantId, input.areaId);
    return this.prisma.table.create({
      data: { ...input, tenantId, qrToken: randomUUID() },
    });
  }

  async update(tenantId: string, id: string, input: UpdateTableInput) {
    await this.findOwnedTable(tenantId, id);
    if (input.areaId) {
      await this.ensureAreaExists(tenantId, input.areaId);
    }
    return this.prisma.table.update({ where: { id }, data: input });
  }

  async remove(tenantId: string, id: string) {
    await this.findOwnedTable(tenantId, id);
    const activeOrders = await this.prisma.order.count({
      where: {
        tenantId,
        tableId: id,
        status: { in: ['OCCUPIED', 'BILL_REQUESTED'] },
      },
    });
    if (activeOrders > 0) {
      throw new ConflictException(
        'Table cannot be deleted while it has an active order',
      );
    }
    return this.prisma.table.delete({ where: { id } });
  }

  async bulkCreate(tenantId: string, input: BulkCreateTablesInput) {
    await this.ensureAreaExists(tenantId, input.areaId);
    const tableNumbers = Array.from(
      { length: input.count },
      (_, index) => input.startNumber + index,
    );

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.table.findMany({
          where: {
            tenantId,
            areaId: input.areaId,
            tableNumber: { in: tableNumbers },
          },
          select: { tableNumber: true },
        });
        if (existing.length > 0) {
          throw new ConflictException({
            message: 'Table numbers already exist',
            tableNumbers: existing.map((table) => table.tableNumber),
          });
        }
        return transaction.table.createMany({
          data: tableNumbers.map((tableNumber) => ({
            tenantId,
            areaId: input.areaId,
            tableNumber,
            seatsCount: input.seatsCount,
            qrToken: randomUUID(),
          })),
        });
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Table number or QR token already exists');
      }
      throw error;
    }
  }

  async updateStatus(tenantId: string, id: string, status: TableStatus) {
    await this.findOwnedTable(tenantId, id);
    return this.prisma.table.update({ where: { id }, data: { status } });
  }

  private async ensureAreaExists(tenantId: string, areaId: string) {
    if (this.areasService) {
      return this.areasService.ensureExists(tenantId, areaId);
    }
    const area = await this.prisma.area.findFirst({
      where: { id: areaId, tenantId },
    });
    if (!area) throw new NotFoundException('Area not found');
    return area;
  }

  private async findOwnedTable(tenantId: string, id: string) {
    const table = await this.prisma.table.findFirst({
      where: { id, tenantId },
    });
    if (!table) throw new NotFoundException('Table not found');
    return table;
  }

  private isUniqueViolation(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
