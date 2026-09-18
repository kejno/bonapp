import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Patch,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrderService } from './order.service';
import { RealtimeGateway } from './realtime.gateway';
import { StaffAuthService } from './staff-auth.service';

type UpdateOrderStatusDto = { status: OrderStatus };

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orderService: OrderService,
    private readonly gateway: RealtimeGateway,
    private readonly staffAuthService: StaffAuthService,
  ) {}

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateOrderStatusDto,
    @Headers('authorization') authorization?: string,
  ) {
    const staff = this.staffAuthService.authenticate(
      this.bearerToken(authorization),
    );
    if (staff.role !== 'kitchen')
      throw new ForbiddenException(
        'Only kitchen staff can update order status',
      );
    const order = await this.orderService.updateStatus(
      id,
      staff.tenantId,
      body.status,
    );
    this.gateway.emitOrderStatusChanged(order);
    return order;
  }

  private bearerToken(authorization?: string): string | undefined {
    if (!authorization?.startsWith('Bearer '))
      throw new UnauthorizedException('Missing staff token');
    return authorization.slice(7);
  }
}
