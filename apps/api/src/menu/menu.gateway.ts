import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { Server as HttpServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';

@Injectable()
export class MenuGateway implements OnModuleInit {
  private io!: Server;
  private readonly logger = new Logger(MenuGateway.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly authGuard: AuthGuard,
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
    if (qrToken) {
      const table = await this.prisma.findTableByQrToken(qrToken);
      if (!table) {
        socket.disconnect(true);
        return;
      }
      await socket.join(`tenant:${table.tenantId}`);
      return;
    }

    const accessToken =
      auth !== null && typeof auth === 'object' && typeof auth['accessToken'] === 'string'
        ? auth['accessToken']
        : undefined;
    const tenantId = accessToken
      ? await this.authGuard.getTenantIdForSocketToken(accessToken)
      : null;
    if (!tenantId) {
      socket.disconnect(true);
      return;
    }
    await socket.join(`tenant_${tenantId}_hall`);
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

  emitWaiterCalled(
    tenantId: string,
    payload: { tableId: string; tableNumber: number; reason: 'NEED_BILL' | 'CALL_STAFF' },
  ): void {
    this.io.to(`tenant_${tenantId}_hall`).emit('waiter:called', payload);
  }
}
