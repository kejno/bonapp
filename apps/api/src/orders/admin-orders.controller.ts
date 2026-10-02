import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { OrdersService } from './orders.service';

@Controller('admin/orders')
@ApiTags('Администрирование')
@ApiBearerAuth()
@UseGuards(AuthGuard, TenantContextGuard, AdminRoleGuard)
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @ApiOperation({ summary: 'Создать или выполнить admin/orders' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Post()
  create(@Body() body: unknown) {
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as Record<string, unknown>)['tableId'] !== 'string' ||
      !(body as Record<string, string>)['tableId'].trim() ||
      typeof (body as Record<string, unknown>)['phone'] !== 'string' ||
      !(body as Record<string, string>)['phone'].trim()
    ) {
      throw new BadRequestException('tableId and phone are required');
    }
    const value = body as { tableId: string; phone: string; items?: unknown };
    if (value.items !== undefined && (!Array.isArray(value.items) || value.items.length === 0)) {
      throw new BadRequestException('items must be a non-empty array');
    }
    const items = (value.items ?? []) as unknown[];
    const orderItems = items.map((item) => {
      if (typeof item !== 'object' || item === null) throw new BadRequestException('Invalid order item');
      const entry = item as Record<string, unknown>;
      if (typeof entry['menuItemId'] !== 'string' || !entry['menuItemId'].trim() ||
        !Number.isInteger(entry['quantity']) || (entry['quantity'] as number) < 1 || (entry['quantity'] as number) > 20 ||
        !Array.isArray(entry['selectedModifiers']) || entry['selectedModifiers'].some((id) => typeof id !== 'string')) {
        throw new BadRequestException('Invalid order item');
      }
      return { menuItemId: entry['menuItemId'].trim(), quantity: entry['quantity'] as number, selectedModifiers: entry['selectedModifiers'] as string[] };
    });
    return orderItems.length === 0
      ? this.ordersService.create(value.tableId.trim(), value.phone.trim())
      : this.ordersService.create(value.tableId.trim(), value.phone.trim(), orderItems);
  }

  @ApiOperation({ summary: 'Получить admin/orders active' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Get('active')
  findActive() {
    return this.ordersService.findActive();
  }

  @ApiOperation({ summary: 'Изменить admin/orders :orderId/status' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Patch(':orderId/status')
  changeStatus(@Param('orderId') id: string, @Body() body: unknown) {
    if (typeof body !== 'object' || body === null || typeof (body as Record<string, unknown>)['status'] !== 'string' || !Object.values(OrderStatus).includes((body as { status: OrderStatus }).status)) {
      throw new BadRequestException('status is invalid');
    }
    return this.ordersService.changeStatus(id, (body as { status: OrderStatus }).status);
  }

  @ApiOperation({ summary: 'Получить admin/orders :id' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }
}
