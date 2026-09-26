import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { Server as HttpServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MenuGateway implements OnModuleInit {
  private io!: Server;
  private readonly logger = new Logger(MenuGateway.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const httpServer = this.httpAdapterHost.httpAdapter.getHttpServer() as HttpServer;
    const configuredOrigins = this.config.get<string>('CORS_ORIGIN');
    const allowedOrigins = configuredOrigins
      ?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? false;

    this.io = new Server(httpServer, { cors: { origin: allowedOrigins } });
    this.io.on('connection', (socket: Socket) => {
      void this.joinTenantRoom(socket).catch((error: unknown) =>
        this.handleJoinTenantRoomError(socket, error),
      );
    });
  }

  private handleJoinTenantRoomError(socket: Socket, error: unknown): void {
    this.logger.error('Unable to join menu WebSocket tenant room', error);
    socket.disconnect(true);
  }

  private async joinTenantRoom(socket: Socket): Promise<void> {
    const auth = socket.handshake.auth;
    const qrToken =
      auth !== null && typeof auth === 'object' && typeof auth['qrToken'] === 'string'
        ? auth['qrToken']
        : undefined;
    if (!qrToken) {
      socket.disconnect(true);
      return;
    }

    const table = await this.prisma.findTableByQrToken(qrToken);
    if (!table) {
      socket.disconnect(true);
      return;
    }

    await socket.join(`tenant:${table.tenantId}`);
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

  emitOrderStatusChanged(tenantId: string, orderId: string, status: string): void {
    const payload = { orderId, status };
    this.io.to(`order_${orderId}`).emit('order:status_changed', payload);
    this.io.to(`tenant:${tenantId}:tenant_kitchen`).emit('order:status_changed', payload);
  }
}
