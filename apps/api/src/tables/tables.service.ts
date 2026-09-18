import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';

export interface BulkCreateTablesInput {
  tenantId: string;
  zoneId: string;
  seats: number;
  fromNumber: number;
  toNumber: number;
}

export interface GenerateQrPdfInput {
  tenantId: string;
  tableIds: string[];
}

interface StoredTable {
  id: string;
  number: number;
  seats: number;
  qrToken: string;
  zoneId: string;
}

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guestPwaBaseUrl = process.env.GUEST_PWA_URL ??
      'https://guest.bonapp.app',
  ) {}

  async bulkCreate(input: BulkCreateTablesInput) {
    this.validateBulkInput(input);
    const zone = await this.prisma.zone.findFirst({
      where: { id: input.zoneId, tenantId: input.tenantId },
    });
    if (!zone) {
      throw new NotFoundException('Zone not found');
    }

    const numbers = Array.from(
      { length: input.toNumber - input.fromNumber + 1 },
      (_, index) => input.fromNumber + index,
    );
    await this.prisma.$transaction(async (transaction) => {
      const occupied = await transaction.table.findMany({
        where: { tenantId: input.tenantId, number: { in: numbers } },
        select: { number: true },
      });
      if (occupied.length > 0) {
        throw new ConflictException(
          `Table numbers already exist: ${occupied.map((table) => table.number).join(', ')}`,
        );
      }

      await transaction.table.createMany({
        data: numbers.map((number) => ({
          tenantId: input.tenantId,
          zoneId: input.zoneId,
          number,
          seats: input.seats,
          qrToken: randomUUID(),
        })),
      });
    });

    const tables = await this.prisma.table.findMany({
      where: {
        tenantId: input.tenantId,
        zoneId: input.zoneId,
        number: { in: numbers },
      },
      orderBy: { number: 'asc' },
    });
    return tables.map((table) => this.toResponse(table));
  }

  async generateQrPdf(input: GenerateQrPdfInput): Promise<Buffer> {
    if (!input.tenantId || input.tableIds.length === 0) {
      throw new BadRequestException('tenantId and tableIds are required');
    }
    const tables = await this.prisma.table.findMany({
      where: { tenantId: input.tenantId, id: { in: input.tableIds } },
      include: { tenant: { select: { name: true } } },
      orderBy: { number: 'asc' },
    });
    if (tables.length !== new Set(input.tableIds).size) {
      throw new NotFoundException('One or more tables were not found');
    }
    return this.createPdf(tables);
  }

  private validateBulkInput(input: BulkCreateTablesInput) {
    if (
      !input.tenantId ||
      !input.zoneId ||
      !Number.isInteger(input.seats) ||
      input.seats < 1 ||
      !Number.isInteger(input.fromNumber) ||
      !Number.isInteger(input.toNumber) ||
      input.fromNumber < 1 ||
      input.toNumber < input.fromNumber
    ) {
      throw new BadRequestException('Invalid table range');
    }
  }

  private toResponse(table: StoredTable) {
    return {
      ...table,
      qrUrl: `${this.guestPwaBaseUrl.replace(/\/$/, '')}/q/${table.qrToken}`,
    };
  }

  private async createPdf(
    tables: Array<StoredTable & { tenant: { name: string } }>,
  ): Promise<Buffer> {
    const document = new PDFDocument({ size: 'A4', margin: 56 });
    const chunks: Buffer[] = [];
    const completed = new Promise<Buffer>((resolve, reject) => {
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });

    for (const [index, table] of tables.entries()) {
      if (index > 0) document.addPage();
      const qrImage = await QRCode.toBuffer(this.toResponse(table).qrUrl, {
        width: 360,
        margin: 1,
      });
      document.fontSize(28).text(table.tenant.name, { align: 'center' });
      document.moveDown();
      document.image(qrImage, 118, 160, { fit: [360, 360], align: 'center' });
      document.y = 560;
      document.fontSize(32).text(`Table ${table.number}`, { align: 'center' });
    }
    document.end();
    return completed;
  }
}
