import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { WaiterCalledEvent } from '@bonapp/shared-types';

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class WaiterCallGateway {
  @WebSocketServer()
  private server!: Server;

  @SubscribeMessage('hall:join')
  async joinHall(client: Socket, tenantId: string): Promise<{ room: string }> {
    await client.join(this.hallRoom(tenantId));
    return { room: this.hallRoom(tenantId) };
  }

  emitWaiterCalled(tenantId: string, event: WaiterCalledEvent): void {
    this.server.to(this.hallRoom(tenantId)).emit('waiter:called', event);
  }

  private hallRoom(tenantId: string): string {
    return `tenant_${tenantId}_hall`;
  }
}
