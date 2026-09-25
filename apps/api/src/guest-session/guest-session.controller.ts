import { Controller, Get, Param } from '@nestjs/common';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { GuestSessionService } from './guest-session.service';

@Controller('api/v1/guest/session')
@SkipTenantGuard()
export class GuestSessionController {
  constructor(private readonly guestSessionService: GuestSessionService) {}

  @Get(':qr_token')
  resolveSession(@Param('qr_token') qrToken: string) {
    return this.guestSessionService.resolveByQrToken(qrToken);
  }
}
