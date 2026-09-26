import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import type { TenantRequest } from '../auth/tenant-context.guard';
import { HallsService } from './halls.service';

interface CreateAreaBody {
  name: string;
  sortOrder?: number;
  sort_order?: number;
}

@Controller('admin/areas')
@UseGuards(AuthGuard, TenantContextGuard)
export class AreasController {
  constructor(private readonly hallsService: HallsService) {}

  @Get()
  list(@Req() req: TenantRequest) {
    return this.hallsService.listAreas(req.user!.tenantId!);
  }

  @Post()
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    if (!this.isValidCreateArea(body)) {
      throw new BadRequestException('name is required');
    }
    return this.hallsService.createArea(req.user!.tenantId!, {
      name: body.name.trim(),
      sortOrder: body.sort_order ?? body.sortOrder,
    });
  }

  private isValidCreateArea(body: unknown): body is CreateAreaBody {
    if (typeof body !== 'object' || body === null) return false;
    const b = body as Record<string, unknown>;
    return (
      typeof b['name'] === 'string' &&
      b['name'].trim().length > 0 &&
      (b['sortOrder'] === undefined ||
        (typeof b['sortOrder'] === 'number' && Number.isInteger(b['sortOrder']))) &&
      (b['sort_order'] === undefined ||
        (typeof b['sort_order'] === 'number' && Number.isInteger(b['sort_order'])))
    );
  }
}
