import { Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { PosService } from './pos.service';

@Controller('api/v1/admin/pos')
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Post('sync-menu')
  @HttpCode(202)
  async syncMenu(@Headers('x-tenant-id') tenantId: string) {
    const jobId = await this.posService.syncMenu(tenantId);
    return { jobId };
  }

  @Get('health')
  async health(@Headers('x-tenant-id') tenantId: string) {
    return this.posService.getHealth(tenantId);
  }
}
