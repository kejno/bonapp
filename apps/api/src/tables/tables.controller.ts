import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { TableStatus } from '@prisma/client';
import { TenantId } from '../auth/tenant-id.decorator';
import { TablesService } from './tables.service';
import type {
  BulkCreateTablesInput,
  CreateTableInput,
  UpdateTableInput,
} from './tables.service';

@Controller('api/v1/admin/tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.tablesService.findAll(tenantId);
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() input: CreateTableInput) {
    return this.tablesService.create(tenantId, input);
  }

  @Post('bulk')
  bulkCreate(
    @TenantId() tenantId: string,
    @Body() input: BulkCreateTablesInput,
  ) {
    return this.tablesService.bulkCreate(tenantId, input);
  }

  @Put(':id')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() input: UpdateTableInput,
  ) {
    return this.tablesService.update(tenantId, id, input);
  }

  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.tablesService.remove(tenantId, id);
  }

  @Patch(':id/status')
  updateStatus(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body('status') status: TableStatus,
  ) {
    return this.tablesService.updateStatus(tenantId, id, status);
  }
}
