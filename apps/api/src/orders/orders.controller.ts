import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import type { TenantRequest } from '../auth/tenant-context.guard';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(AuthGuard, TenantContextGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Body() body: unknown) {
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as Record<string, unknown>)['tableId'] !== 'string' ||
      !(body as Record<string, string>)['tableId'].trim()
    ) {
      throw new BadRequestException('tableId is required');
    }
    return this.ordersService.create(
      (body as { tableId: string }).tableId.trim(),
    );
  }

  @Post(':id/pay')
  @UseGuards(AdminRoleGuard)
  @HttpCode(200)
  pay(@Param('id') id: string) {
    return this.ordersService.pay(id);
  }

  @Get()
  findAll() {
    return this.ordersService.findAll();
  }

  @Get('kds')
  findKitchenOrders(@Req() request: TenantRequest) {
    this.assertKitchenAccess(request);
    return this.ordersService.findKitchenOrders(
      request.user!.userId!,
      request.user!.role!,
    );
  }

  @Patch(':id/kds-status')
  updateKitchenStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: TenantRequest,
  ) {
    this.assertKitchenAccess(request);
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as Record<string, unknown>).status !== 'string'
    ) {
      throw new BadRequestException('status is required');
    }
    const value = body as { status: string; department?: string };
    if (
      value.department !== undefined &&
      !['HOT', 'COLD', 'BAR'].includes(value.department)
    ) {
      throw new BadRequestException('department is invalid');
    }
    return this.ordersService.updateKitchenStatus(
      id,
      value.status,
      value.department,
      request.user!.userId!,
      request.user!.role!,
    );
  }

  private assertKitchenAccess(request: TenantRequest): void {
    if (!['CHEF', 'OWNER', 'MANAGER'].includes(request.user?.role ?? '')) {
      throw new ForbiddenException('KDS access is required');
    }
    if (!request.user?.userId)
      throw new ForbiddenException('Staff identity is required');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }
}
