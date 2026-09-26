import { CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import type { TenantRequest } from '../auth/tenant-context.guard';
import { StaffService } from './staff.service';

const SHIFT_ROLES = new Set<UserRole>([UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN, UserRole.CASHIER]);

class ShiftAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    if (!request.user?.role || !SHIFT_ROLES.has(request.user.role)) throw new ForbiddenException('Shift access is required');
    return true;
  }
}

@Controller('admin/shifts')
@UseGuards(AuthGuard, TenantContextGuard, ShiftAccessGuard)
export class ShiftsController {
  constructor(private readonly staff: StaffService) {}

  @Get('current') currentShift() { return this.staff.currentShift(); }

  @Post('open') openShift(@Req() request: TenantRequest) {
    if (!request.user?.userId) throw new ForbiddenException('An authenticated cashier is required');
    return this.staff.openShift(request.user.userId);
  }

  @Post('close') closeShift() { return this.staff.closeShift(); }
}
