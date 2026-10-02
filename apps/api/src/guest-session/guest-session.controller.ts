import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Controller, Get, Param } from '@nestjs/common';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { GuestSessionService } from './guest-session.service';

@Controller('guest/session')
@ApiTags('Гостевые операции')
@SkipTenantGuard()
export class GuestSessionController {
  constructor(private readonly guestSessionService: GuestSessionService) {}

  @ApiOperation({ summary: 'Получить guest/session :qr_token' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Get(':qr_token')
  resolveSession(@Param('qr_token') qrToken: string) {
    return this.guestSessionService.resolveByQrToken(qrToken);
  }
}
