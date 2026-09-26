import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
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
    return this.ordersService.create((body as { tableId: string }).tableId.trim());
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }
}
