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
import { OrderStatus } from '@prisma/client';
import type { TenantRequest } from '../auth/tenant-context.guard';
import { OrdersService } from './orders.service';
import { MenuGateway } from '../menu/menu.gateway';

@Controller('orders')
@UseGuards(AuthGuard, TenantContextGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly menuGateway: MenuGateway,
  ) {}

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
    return this.ordersService.create((body as { tableId: string }).tableId.trim()).then((order) => {
      this.menuGateway.emitOrderCreated(order.tenantId, order);
      return order;
    });
  }

  @Post(':id/pay')
  @UseGuards(AdminRoleGuard)
  @HttpCode(200)
  async pay(@Param('id') id: string) {
    const order = await this.ordersService.pay(id);
    this.menuGateway.emitOrderStatusChanged(order.tenantId, order.id, order.status, order);
    await this.menuGateway.closeOrderSession(order.tenantId, order.tableId, order.id);
    return order;
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

  @Patch(':id/status')
  @UseGuards(AdminRoleGuard)
  async updateStatus(@Param('id') id: string, @Body() body: unknown) {
    const status = typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)['status']
      : undefined;
    if (
      typeof status !== 'string' ||
      !Object.values(OrderStatus).includes(status as OrderStatus) ||
      status === OrderStatus.PAID
    ) {
      throw new BadRequestException('Valid unpaid order status is required');
    }
    const order = await this.ordersService.updateStatus(id, status as OrderStatus);
    this.menuGateway.emitOrderStatusChanged(order.tenantId, order.id, order.status, order);
    return order;
  }
}
