import {
  ConflictException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TableStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { createGuestTableUrl } from './guest-table-url';

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
  label?: string | null;
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

function getGuestMenuBaseUrl(): string {
  const configuredUrl = process.env.GUEST_MENU_URL?.trim();
  if (!configuredUrl && process.env.NODE_ENV === 'production') {
    throw new InternalServerErrorException('GUEST_MENU_URL must be configured in production');
  }

  const menuUrl = configuredUrl || 'http://localhost:5173/menu';
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(menuUrl);
  } catch {
    throw new InternalServerErrorException('GUEST_MENU_URL must be a valid absolute URL');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new InternalServerErrorException('GUEST_MENU_URL must use HTTP or HTTPS');
  }
  if (process.env.NODE_ENV === 'production' &&
      (parsedUrl.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname))) {
    throw new InternalServerErrorException('GUEST_MENU_URL must be a public HTTPS URL in production');
  }
  return parsedUrl.toString();
}

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
      include: {
        orders: {
          where: { status: { notIn: ['PAID', 'CANCELLED'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true, totalAmountByn: true },
        },
      },
    });
  }

  async generateQrPdf(tenantId: string, tableIds: string[]): Promise<Buffer> {
    const menuBaseUrl = getGuestMenuBaseUrl();
    const tables = await this.prisma.forTenant(tenantId).table.findMany({
      where: { id: { in: tableIds } },
      orderBy: [{ areaId: 'asc' }, { tableNumber: 'asc' }],
      include: { area: { select: { name: true } } },
    });
    if (tables.length !== tableIds.length) {
      throw new NotFoundException('One or more tables were not found');
    }

    const document = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    const finished = new Promise<Buffer>((resolve, reject) => {
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });
    for (const [index, table] of tables.entries()) {
      if (index > 0 && index % 4 === 0) document.addPage();
      const slot = index % 4;
      const x = slot % 2 === 0 ? 55 : 315;
      const y = Math.floor(slot / 2) === 0 ? 70 : 410;
      const guestTableUrl = createGuestTableUrl(menuBaseUrl, table.qrToken);
      const qr = await QRCode.toBuffer(guestTableUrl, { type: 'png', width: 220, margin: 1 });
      document.fontSize(18).text(`Стол ${table.tableNumber}`, x, y, { width: 220, align: 'center' });
      document.fontSize(11).text(table.area.name, x, y + 26, { width: 220, align: 'center' });
      document.image(qr, x + 35, y + 48, { width: 150, height: 150 });
      document.fontSize(8).text(guestTableUrl, x, y + 205, { width: 220, align: 'center' });
    }
    document.end();
    return finished;
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
      const stillExists = await this.prisma.forTenant(tenantId).table.findFirst({
        where: { id: tableId },
        select: { id: true },
      });
      if (!stillExists) {
        return;
      }
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
