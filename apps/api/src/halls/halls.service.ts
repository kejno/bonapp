import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TableStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateAreaDto {
  name: string;
  sortOrder?: number;
}

export interface CreateTableDto {
  tableNumber: number;
  label?: string;
  seatsCount?: number;
  areaId: string;
}

export interface UpdateTableDto {
  tableNumber?: number;
  label?: string;
  seatsCount?: number;
  areaId?: string;
}

export interface BulkCreateTablesDto {
  areaId: string;
  startNumber: number;
  count: number;
  seatsCount?: number;
}

const ACTIVE_TABLE_STATUSES = new Set<TableStatus>([
  TableStatus.OCCUPIED,
  TableStatus.BILL_REQUESTED,
]);

@Injectable()
export class HallsService {
  constructor(private readonly prisma: PrismaService) {}

  listAreas(tenantId: string) {
    return this.prisma.forTenant(tenantId).diningArea.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  createArea(tenantId: string, dto: CreateAreaDto) {
    return this.prisma.forTenant(tenantId).diningArea.create({
      data: {
        tenantId,
        name: dto.name,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  listTables(tenantId: string) {
    return this.prisma.forTenant(tenantId).table.findMany({
      orderBy: [{ areaId: 'asc' }, { tableNumber: 'asc' }],
    });
  }

  async createTable(tenantId: string, dto: CreateTableDto) {
    await this.verifyAreaBelongsToTenant(tenantId, dto.areaId);
    try {
      return await this.prisma.forTenant(tenantId).table.create({
        data: {
          tenantId,
          areaId: dto.areaId,
          tableNumber: dto.tableNumber,
          label: dto.label,
          seatsCount: dto.seatsCount ?? 1,
          qrToken: randomUUID(),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Table number ${dto.tableNumber} already exists in this tenant`);
      }
      throw err;
    }
  }

  async updateTable(tenantId: string, tableId: string, dto: UpdateTableDto) {
    if (dto.areaId !== undefined) {
      await this.verifyAreaBelongsToTenant(tenantId, dto.areaId);
    }
    const table = await this.prisma.forTenant(tenantId).table.findFirst({
      where: { id: tableId },
      select: { id: true },
    });
    if (!table) {
      throw new NotFoundException(`Table ${tableId} not found`);
    }
    try {
      return await this.prisma.forTenant(tenantId).table.update({
        where: { id_tenantId: { id: tableId, tenantId } },
        data: {
          ...(dto.tableNumber !== undefined && { tableNumber: dto.tableNumber }),
          ...(dto.label !== undefined && { label: dto.label }),
          ...(dto.seatsCount !== undefined && { seatsCount: dto.seatsCount }),
          ...(dto.areaId !== undefined && { areaId: dto.areaId }),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Table number already exists in this tenant');
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException(`Table ${tableId} not found`);
      }
      throw err;
    }
  }

  async deleteTable(tenantId: string, tableId: string): Promise<void> {
    const table = await this.prisma.forTenant(tenantId).table.findFirst({
      where: { id: tableId },
      select: { id: true, status: true },
    });
    if (!table) {
      throw new NotFoundException(`Table ${tableId} not found`);
    }
    if (ACTIVE_TABLE_STATUSES.has(table.status)) {
      throw new ConflictException(
        'Table cannot be deleted: it has an active status. Close the order first.',
      );
    }
    const result = await this.prisma.forTenant(tenantId).table.deleteMany({
      where: {
        id: tableId,
        status: { notIn: Array.from(ACTIVE_TABLE_STATUSES) },
      },
    });
    if (result.count === 0) {
      throw new ConflictException(
        'Table cannot be deleted: its status changed to active concurrently.',
      );
    }
  }

  async bulkCreateTables(tenantId: string, dto: BulkCreateTablesDto) {
    await this.verifyAreaBelongsToTenant(tenantId, dto.areaId);

    const tableNumbers = Array.from(
      { length: dto.count },
      (_, i) => dto.startNumber + i,
    );

    const existing = await this.prisma.forTenant(tenantId).table.findMany({
      where: { tableNumber: { in: tableNumbers } },
      select: { tableNumber: true },
    });

    if (existing.length > 0) {
      throw new ConflictException({
        message: 'Some table numbers already exist in this tenant',
        conflicts: existing.map((t) => t.tableNumber),
      });
    }

    const data = tableNumbers.map((tableNumber) => ({
      tenantId,
      areaId: dto.areaId,
      tableNumber,
      seatsCount: dto.seatsCount ?? 1,
      qrToken: randomUUID(),
    }));

    try {
      await this.prisma.forTenant(tenantId).table.createMany({ data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Table number conflict — concurrent request created the same numbers');
      }
      throw err;
    }

    return this.prisma.forTenant(tenantId).table.findMany({
      where: { tableNumber: { in: tableNumbers } },
      orderBy: { tableNumber: 'asc' },
    });
  }

  async updateTableStatus(tenantId: string, tableId: string, status: TableStatus) {
    const table = await this.prisma.forTenant(tenantId).table.findFirst({
      where: { id: tableId },
      select: { id: true },
    });
    if (!table) {
      throw new NotFoundException(`Table ${tableId} not found`);
    }
    try {
      return await this.prisma.forTenant(tenantId).table.update({
        where: { id_tenantId: { id: tableId, tenantId } },
        data: { status },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException(`Table ${tableId} not found`);
      }
      throw err;
    }
  }

  private async verifyAreaBelongsToTenant(
    tenantId: string,
    areaId: string,
  ): Promise<void> {
    const area = await this.prisma.forTenant(tenantId).diningArea.findFirst({
      where: { id: areaId },
      select: { id: true },
    });
    if (!area) {
      throw new NotFoundException(`Area ${areaId} not found`);
    }
  }
}
