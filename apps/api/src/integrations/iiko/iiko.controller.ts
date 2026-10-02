import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminRoleGuard } from '../../auth/admin-role.guard';
import { IikoService } from './iiko.service';

@Controller('admin/pos')
@ApiTags('Администрирование')
@ApiBearerAuth()
@UseGuards(AuthGuard, AdminRoleGuard)
export class IikoController {
  constructor(private readonly iiko: IikoService) {}

  @ApiOperation({ summary: 'Получить admin/pos sync-status' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Get('sync-status')
  syncStatus() { return this.iiko.getSyncStatus(); }
}
