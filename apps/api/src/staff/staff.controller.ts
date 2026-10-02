import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { AuthGuard } from '../auth/auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import type { TenantRequest } from '../auth/tenant-context.guard';
import { UserRole } from '@prisma/client';
import { StaffService } from './staff.service';
import type { StaffInput } from './staff.service';
import { ShiftService } from './shift.service';

function record(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new BadRequestException('Request body must be an object');
  return body as Record<string, unknown>;
}

@Controller('admin')
@ApiTags('Администрирование')
@ApiBearerAuth()
@UseGuards(AuthGuard, TenantContextGuard)
export class StaffController {
  constructor(
    private readonly staff: StaffService,
    private readonly shifts: ShiftService,
  ) {}

  @ApiOperation({ summary: 'Получить admin staff' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Get('staff')
  @UseGuards(AdminRoleGuard)
  list(@Req() req: TenantRequest) {
    return this.staff.list(req.user!.tenantId!);
  }
  @ApiOperation({ summary: 'Получить admin kitchen-staff' })
  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Get('kitchen-staff')
  @UseGuards(AdminRoleGuard)
  listKitchenStaff(@Req() req: TenantRequest) {
    return this.staff.listKitchenStaff(req.user!.tenantId!);
  }
  @ApiOperation({ summary: 'Обновить admin staff/:id/kitchen-departments' })
  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Put('staff/:id/kitchen-departments')
  @UseGuards(AdminRoleGuard)
  updateKitchenDepartments(
    @Req() req: TenantRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const departments = record(body)['kitchenDepartments'];
    if (!Array.isArray(departments) || departments.some((value) => typeof value !== 'string'))
      throw new BadRequestException('kitchenDepartments must be an array of strings');
    return this.staff.updateKitchenDepartments(
      req.user!.tenantId!,
      id,
      departments as string[],
    );
  }
  @ApiOperation({ summary: 'Создать или выполнить admin staff' })
  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Post('staff')
  @UseGuards(AdminRoleGuard)
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    return this.staff.create(
      req.user!.tenantId!,
      record(body) as unknown as StaffInput,
    );
  }
  @ApiOperation({ summary: 'Обновить admin staff/:id' })
  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Put('staff/:id')
  @UseGuards(AdminRoleGuard)
  update(
    @Req() req: TenantRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.staff.update(req.user!.tenantId!, id, record(body));
  }
  @ApiOperation({ summary: 'Удалить admin staff/:id' })
  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Delete('staff/:id')
  @UseGuards(AdminRoleGuard)
  deactivate(@Req() req: TenantRequest, @Param('id') id: string) {
    return this.staff.deactivate(req.user!.tenantId!, id);
  }
  @ApiOperation({ summary: 'Изменить admin staff/:id/reset-pin' })
  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Patch('staff/:id/reset-pin')
  @UseGuards(AdminRoleGuard)
  resetPin(@Req() req: TenantRequest, @Param('id') id: string) {
    return this.staff.resetPin(req.user!.tenantId!, id);
  }

  @ApiOperation({ summary: 'Создать или выполнить shifts/open' })
  @Post('shifts/open')
  open(@Req() req: TenantRequest, @Body() body: unknown) {
    const shiftRoles = new Set<UserRole>([
      UserRole.CASHIER,
      UserRole.MANAGER,
      UserRole.OWNER,
      UserRole.SUPER_ADMIN,
    ]);
    if (!shiftRoles.has(req.user!.role!)) {
      throw new ForbiddenException('Shift access is required');
    }
    const cashierId = record(body)['cashier_id'];
    if (typeof cashierId !== 'string' || !cashierId)
      throw new BadRequestException('cashier_id is required');
    if (req.user!.role === UserRole.CASHIER && cashierId !== req.user!.userId)
      throw new ForbiddenException('Cashiers can only open their own shift');
    return this.shifts.open(req.user!.tenantId!, cashierId);
  }
  @ApiOperation({ summary: 'Создать или выполнить admin shifts/close' })
  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Post('shifts/close')
  @UseGuards(AdminRoleGuard)
  close(@Req() req: TenantRequest) {
    return this.shifts.close(req.user!.tenantId!);
  }
  @ApiOperation({ summary: 'Получить admin shifts/current' })
  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Get('shifts/current')
  @UseGuards(AdminRoleGuard)
  current(@Req() req: TenantRequest) {
    return this.shifts.current(req.user!.tenantId!);
  }
}
