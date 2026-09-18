import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ cors: { origin: true } })
@Injectable()
export class OrdersEvents {
  @WebSocketServer()
  private server!: Server;

  publishStatusChanged(tenantId: string, orderId: string, status: OrderStatus) {
    const payload = { orderId, status };
    this.server.to(`order_${orderId}`).emit('order:status_changed', payload);
    this.server.to(`tenant_${tenantId}_kitchen`).emit('order:status_changed', payload);
  }
}
