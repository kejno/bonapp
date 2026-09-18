import { Body, Controller, Header, Post } from '@nestjs/common';
import { TablesService } from './tables.service';

@Controller('api/v1/admin/tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Post('bulk')
  bulkCreate(@Body() body: Parameters<TablesService['bulkCreate']>[0]) {
    return this.tablesService.bulkCreate(body);
  }

  @Post('generate-qr-pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="table-qr-codes.pdf"')
  generateQrPdf(@Body() body: Parameters<TablesService['generateQrPdf']>[0]) {
    return this.tablesService.generateQrPdf(body);
  }
}
