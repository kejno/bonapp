import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { TableService } from './table.service.js';

@Controller('public/tables')
export class PublicTableController {
  constructor(private readonly tableService: TableService) {}

  @Get(':tableId')
  resolve(@Param('tableId', ParseUUIDPipe) tableId: string) {
    return this.tableService.resolvePublic(tableId);
  }
}
