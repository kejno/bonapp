import { Body, Controller, Get, Post } from '@nestjs/common';
import { TenantId } from '../auth/tenant-id.decorator';
import { AreasService } from './areas.service';
import type { CreateAreaInput } from './areas.service';

@Controller('api/v1/admin/areas')
export class AreasController {
  constructor(private readonly areasService: AreasService) {}

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.areasService.findAll(tenantId);
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() input: CreateAreaInput) {
    return this.areasService.create(tenantId, input);
  }
}
