import { Injectable, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Server } from 'socket.io';

@Injectable()
export class SocketService implements OnModuleInit {
  private io!: Server;

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  onModuleInit() {
    const httpServer = this.httpAdapterHost.httpAdapter.getHttpServer();
    this.io = new Server(httpServer, {
      cors: { origin: '*' },
    });
  }

  emitToRoom(room: string, event: string, data: unknown): void {
    this.io.to(room).emit(event, data);
  }
}
