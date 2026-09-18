import { Controller, Get, Param } from '@nestjs/common';
import { GuestService } from './guest.service';

@Controller('api/v1/guest/session')
export class GuestController {
  constructor(private readonly guestService: GuestService) {}

  @Get(':qrToken')
  getSession(@Param('qrToken') qrToken: string) {
    return this.guestService.getSession(qrToken);
  }
}
