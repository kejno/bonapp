import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { SkipTenantGuard } from './tenant/tenant.constants';

@Controller()
@ApiTags('Общее')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({ summary: 'Получить корневой ресурс' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Get()
  @SkipTenantGuard()
  getHello(): string {
    return this.appService.getHello();
  }
}
