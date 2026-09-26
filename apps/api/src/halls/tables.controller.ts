import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import QRCode from 'qrcode';
import { TableStatus } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import type { TenantRequest } from '../auth/tenant-context.guard';
import { HallsService } from './halls.service';
import { TableQrPdfService } from './table-qr-pdf.service';

const ALLOWED_STATUSES = new Set<string>([
  TableStatus.AVAILABLE,
  TableStatus.OCCUPIED,
  TableStatus.BILL_REQUESTED,
]);

interface CreateTableBody {
  tableNumber: number;
  label?: string;
  seatsCount?: number;
  areaId: string;
}

interface UpdateTableBody {
  tableNumber?: number;
  label?: string | null;
  seatsCount?: number;
  areaId?: string;
}

interface BulkCreateBody {
  areaId: string;
  startNumber: number;
  count: number;
  seatsCount?: number;
}

interface StatusUpdateBody {
  status: string;
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isValidCreateTable(body: unknown): body is CreateTableBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    isPositiveInteger(b['tableNumber']) &&
    typeof b['areaId'] === 'string' &&
    b['areaId'].trim().length > 0 &&
    (b['seatsCount'] === undefined || isPositiveInteger(b['seatsCount'])) &&
    (b['label'] === undefined ||
      (typeof b['label'] === 'string' && b['label'].trim().length > 0))
  );
}

function isValidUpdateTable(body: unknown): body is UpdateTableBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  const hasTableNumber = b['tableNumber'] !== undefined;
  const hasLabel = b['label'] !== undefined;
  const hasSeatsCount = b['seatsCount'] !== undefined;
  const hasAreaId = b['areaId'] !== undefined;

  if (!hasTableNumber && !hasLabel && !hasSeatsCount && !hasAreaId) return false;
  if (hasTableNumber && !isPositiveInteger(b['tableNumber'])) return false;
  if (hasSeatsCount && !isPositiveInteger(b['seatsCount'])) return false;
  if (hasAreaId && (typeof b['areaId'] !== 'string' || b['areaId'].trim().length === 0)) return false;
  if (hasLabel && b['label'] !== null && (typeof b['label'] !== 'string' || b['label'].trim().length === 0)) return false;

  return true;
}

function isValidBulkCreate(body: unknown): body is BulkCreateBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b['areaId'] === 'string' &&
    b['areaId'].trim().length > 0 &&
    isPositiveInteger(b['startNumber']) &&
    isPositiveInteger(b['count']) &&
    (b['count'] as number) <= 100 &&
    (b['seatsCount'] === undefined || isPositiveInteger(b['seatsCount']))
  );
}

function isValidStatusUpdate(body: unknown): body is StatusUpdateBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return typeof b['status'] === 'string' && ALLOWED_STATUSES.has(b['status']);
}

@Controller('admin/tables')
@UseGuards(AuthGuard, TenantContextGuard)
export class TablesController {
  constructor(
    private readonly hallsService: HallsService,
    private readonly tableQrPdfService?: TableQrPdfService,
  ) {}

  @Post('generate-qr-pdf')
  @UseGuards(AdminRoleGuard)
  @HttpCode(200)
  async generateQrPdf(@Req() req: TenantRequest, @Body() body: unknown, @Res() res: Response) {
    if (body !== undefined && (typeof body !== 'object' || body === null ||
      ('tableIds' in body && (!Array.isArray((body as { tableIds?: unknown }).tableIds) ||
        !(body as { tableIds: unknown[] }).tableIds.every((id) =>
          typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
        ))))) {
      throw new BadRequestException('tableIds must be an array of UUIDs');
    }
    const tableIds = (body as { tableIds?: string[] } | undefined)?.tableIds;
    const result = await this.tableQrPdfService!.generate(req.user!.tenantId!, tableIds);
    if (Buffer.isBuffer(result)) {
      res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="tables-qr.pdf"' });
      return res.send(result);
    }
    return res.status(202).json(result);
  }

  @Get('generate-qr-pdf/jobs/:jobId')
  getQrPdfJob(@Req() req: TenantRequest, @Param('jobId') jobId: string) {
    return this.tableQrPdfService!.getJob(jobId, req.user!.tenantId!);
  }

  @Get('generate-qr-pdf/jobs/:jobId/file')
  async downloadQrPdf(@Req() req: TenantRequest, @Param('jobId') jobId: string, @Res() res: Response) {
    const file = await this.tableQrPdfService!.getFile(jobId, req.user!.tenantId!);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="tables-qr.pdf"' });
    return res.send(file);
  }

  @Get()
  list(@Req() req: TenantRequest) {
    return this.hallsService.listTables(req.user!.tenantId!);
  }

  @Post()
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    if (!isValidCreateTable(body)) {
      throw new BadRequestException('tableNumber (positive integer) and areaId are required');
    }
    return this.hallsService.createTable(req.user!.tenantId!, {
      tableNumber: body.tableNumber,
      label: typeof body.label === 'string' ? body.label.trim() : undefined,
      seatsCount: body.seatsCount,
      areaId: body.areaId.trim(),
    });
  }

  @Post('bulk')
  bulkCreate(@Req() req: TenantRequest, @Body() body: unknown) {
    if (!isValidBulkCreate(body)) {
      throw new BadRequestException(
        'areaId, startNumber (> 0), and count (1–100) are required',
      );
    }
    return this.hallsService.bulkCreateTables(req.user!.tenantId!, {
      areaId: body.areaId.trim(),
      startNumber: body.startNumber,
      count: body.count,
      seatsCount: body.seatsCount,
    });
  }

  @Get(':id/qr-preview')
  async qrPreview(@Req() req: TenantRequest, @Param('id') id: string) {
    const table = await this.hallsService.getTableQrPreview(req.user!.tenantId!, id);
    return { ...table, qrDataUrl: await QRCode.toDataURL(table.url, { width: 240, margin: 1 }) };
  }

  @Put(':id')
  update(@Req() req: TenantRequest, @Param('id') id: string, @Body() body: unknown) {
    if (!isValidUpdateTable(body)) {
      throw new BadRequestException(
        'At least one valid field (tableNumber, label, seatsCount, areaId) must be provided',
      );
    }
    return this.hallsService.updateTable(req.user!.tenantId!, id, {
      ...(body.tableNumber !== undefined && { tableNumber: body.tableNumber }),
      ...(body.label !== undefined && {
        label: body.label === null ? null : body.label.trim(),
      }),
      ...(body.seatsCount !== undefined && { seatsCount: body.seatsCount }),
      ...(body.areaId !== undefined && { areaId: body.areaId.trim() }),
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: TenantRequest, @Param('id') id: string) {
    await this.hallsService.deleteTable(req.user!.tenantId!, id);
  }

  @Patch(':id/status')
  updateStatus(@Req() req: TenantRequest, @Param('id') id: string, @Body() body: unknown) {
    if (!isValidStatusUpdate(body)) {
      throw new BadRequestException(
        `status must be one of: ${[...ALLOWED_STATUSES].join(', ')}`,
      );
    }
    return this.hallsService.updateTableStatus(
      req.user!.tenantId!,
      id,
      body.status as TableStatus,
    );
  }
}
