import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { SkipTenantGuard } from './tenant/tenant.constants';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @SkipTenantGuard()
  getHello(): string {
    return this.appService.getHello();
  }
}
