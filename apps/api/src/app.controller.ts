import { Controller, Get, Post } from '@nestjs/common';
import type { ReadinessStatus } from '@bonapp/shared-types';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('api/v1/admin/readiness')
  getReadiness(): ReadinessStatus {
    return this.appService.getReadiness();
  }

  @Post('api/v1/admin/shifts/open')
  openShift(): { opened: boolean } {
    return { opened: true };
  }
}
