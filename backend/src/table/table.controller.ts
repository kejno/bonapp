import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../identity/decorators/current-user.decorator.js';
import { Roles } from '../identity/decorators/roles.decorator.js';
import { Role } from '../identity/entities/user.entity.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { CreateTableDto } from './dto/create-table.dto.js';
import { UpdateTableDto } from './dto/update-table.dto.js';
import { TableService } from './table.service.js';

@Controller('tables')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.STAFF)
export class TableController {
  constructor(private readonly tableService: TableService) {}

  @Get()
  findAll(@CurrentUser() user: { tenantId: string }) {
    return this.tableService.findAll(user.tenantId);
  }

  @Post()
  create(@CurrentUser() user: { tenantId: string }, @Body() dto: CreateTableDto) {
    return this.tableService.create(user.tenantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { tenantId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTableDto,
  ) {
    return this.tableService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: { tenantId: string }, @Param('id', ParseUUIDPipe) id: string) {
    await this.tableService.remove(user.tenantId, id);
  }

  @Get(':id/qr')
  async getQr(
    @CurrentUser() user: { tenantId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const buffer = await this.tableService.generateQr(user.tenantId, id);
    res.set('Content-Type', 'image/png');
    res.send(buffer);
  }
}
