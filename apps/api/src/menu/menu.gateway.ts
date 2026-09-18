import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { MenuNotifierService } from './menu-notifier.service';
import { StopListChangedEvent } from './menu.types';

@WebSocketGateway({ namespace: '/menu', cors: { origin: true } })
export class MenuGateway extends MenuNotifierService {
  @WebSocketServer()
  private server: Server;

  override notifyStopListChanged(
    tenantId: string,
    event: StopListChangedEvent,
  ): void {
    this.server.to(`tenant:${tenantId}`).emit('menu:stop_list_changed', event);
  }
}
