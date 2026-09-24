import { Injectable, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Server, Socket } from 'socket.io';

@Injectable()
export class MenuGateway implements OnModuleInit {
  private io!: Server;

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  onModuleInit() {
    const httpServer = this.httpAdapterHost.httpAdapter.getHttpServer();
    this.io = new Server(httpServer, { cors: { origin: '*' } });
    this.io.on('connection', (socket: Socket) => {
      const tenantId = socket.handshake.query['tenantId'];
      if (typeof tenantId === 'string' && tenantId) {
        void socket.join(`tenant:${tenantId}`);
      }
    });
  }

  emitStopListChanged(
    tenantId: string,
    itemId: string,
    isInStopList: boolean,
  ): void {
    this.io.to(`tenant:${tenantId}`).emit('menu:stop_list_changed', {
      itemId,
      isInStopList,
    });
  }
}
