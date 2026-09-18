import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { OrderSnapshot } from '@bonapp/shared-types';

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class OrdersGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('join_order_room')
  joinOrderRoom(client: Socket, payload: { orderId: string }) {
    void client.join(this.roomName(payload.orderId));
  }

  publishStatusChanged(order: OrderSnapshot) {
    this.server
      .to(this.roomName(order.orderId))
      .emit('order:status_changed', order);
  }

  private roomName(orderId: string) {
    return `order:${orderId}`;
  }
}
