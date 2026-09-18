import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ShiftsService } from './shifts.service';

@Controller('api/v1/admin/shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Post(':tenantId/open')
  @HttpCode(HttpStatus.CREATED)
  async open(@Param('tenantId') tenantId: string) {
    const shift = await this.shiftsService.openShift(tenantId);
    return { shift };
  }

  @Post(':tenantId/close')
  @HttpCode(HttpStatus.OK)
  async close(@Param('tenantId') tenantId: string) {
    const result = await this.shiftsService.closeShift(tenantId);
    return result;
  }
}
