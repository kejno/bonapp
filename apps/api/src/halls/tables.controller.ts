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
  UseGuards,
} from '@nestjs/common';
import { TableStatus } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import type { TenantRequest } from '../auth/tenant-context.guard';
import { HallsService } from './halls.service';

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
  label?: string;
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
    (b['label'] === undefined || typeof b['label'] === 'string')
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
  if (hasLabel && typeof b['label'] !== 'string') return false;

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

@Controller('api/v1/admin/tables')
@UseGuards(AuthGuard, TenantContextGuard)
export class TablesController {
  constructor(private readonly hallsService: HallsService) {}

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

  @Put(':id')
  update(@Req() req: TenantRequest, @Param('id') id: string, @Body() body: unknown) {
    if (!isValidUpdateTable(body)) {
      throw new BadRequestException(
        'At least one valid field (tableNumber, label, seatsCount, areaId) must be provided',
      );
    }
    return this.hallsService.updateTable(req.user!.tenantId!, id, {
      ...(body.tableNumber !== undefined && { tableNumber: body.tableNumber }),
      ...(body.label !== undefined && { label: body.label.trim() }),
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
