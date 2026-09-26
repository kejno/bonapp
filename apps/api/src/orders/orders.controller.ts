import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { TenantRequest } from '../auth/tenant-context.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { OrdersService } from './orders.service';
import { WelcomeService } from '../welcome/welcome.service';
import { UserRole } from '@prisma/client';

@Controller('orders')
@UseGuards(AuthGuard, TenantContextGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly welcomeService: WelcomeService,
  ) {}

  @Post()
  create(@Body() body: unknown, @Req() req: TenantRequest) {
    if (typeof body === 'object' && body !== null && (body as Record<string, unknown>)['isTest'] === true) {
      const allowedRoles = new Set<UserRole>([UserRole.OWNER, UserRole.MANAGER]);
      if (!req.user?.role || !allowedRoles.has(req.user.role)) throw new ForbiddenException();
      return this.welcomeService.simulateTestOrder(req.user.tenantId!);
    }
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
