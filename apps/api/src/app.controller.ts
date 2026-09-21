import { Controller, Get, SetMetadata } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @SetMetadata('skipTenantGuard', true)
  getHello(): string {
    return this.appService.getHello();
  }
}
