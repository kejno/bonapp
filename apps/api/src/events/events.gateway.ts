import { Injectable, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Server as SocketIoServer } from 'socket.io';

@Injectable()
export class EventsGateway implements OnModuleInit {
  private io: SocketIoServer;

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  onModuleInit() {
    const httpServer = this.httpAdapterHost.httpAdapter.getHttpServer();
    this.io = new SocketIoServer(httpServer, {
      cors: { origin: '*' },
    });

    this.io.on('connection', (socket) => {
      socket.on('join:order', (orderId: string) => {
        void socket.join(`order:${orderId}`);
      });
    });
  }

  emitPaymentUpdate(orderId: string, paymentId: string) {
    this.io.to(`order:${orderId}`).emit('order.payment.updated.v1', {
      version: 1,
      orderId,
      paymentId,
      status: 'COMPLETED',
    });
  }
}
