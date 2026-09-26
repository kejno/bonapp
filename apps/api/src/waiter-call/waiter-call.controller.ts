import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { GuestSessionGuard } from '../guest-session/guest-session.guard';
import type { QrTokenRequest } from '../guest-session/guest-session.guard';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { WaiterCallService } from './waiter-call.service';

@Controller('guest/call-waiter')
@SkipTenantGuard()
@UseGuards(GuestSessionGuard)
export class WaiterCallController {
  constructor(private readonly waiterCallService: WaiterCallService) {}

  @Post()
  call(@Req() req: QrTokenRequest, @Body() body: unknown) {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('reason must be NEED_BILL or CALL_STAFF');
    }
    const reason = (body as Record<string, unknown>)['reason'];
    if (reason !== 'NEED_BILL' && reason !== 'CALL_STAFF') {
      throw new BadRequestException('reason must be NEED_BILL or CALL_STAFF');
    }
    return this.waiterCallService.call(req.tenantId, req.tableId, reason);
  }
}
