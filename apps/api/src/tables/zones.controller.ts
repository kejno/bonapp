import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ZonesService } from './zones.service';

@Controller('api/v1/admin/zones')
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @Post()
  create(@Body() body: { tenantId: string; name: string }) {
    return this.zonesService.create(body.tenantId, body.name);
  }

  @Get()
  list(@Query('tenantId') tenantId: string) {
    return this.zonesService.list(tenantId);
  }
}
