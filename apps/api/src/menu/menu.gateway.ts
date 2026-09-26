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
      socket.on('join_order_room', (payload: unknown) => {
        void this.joinOrderRoom(socket, payload).catch((error: unknown) => {
          this.logger.error('Unable to join order WebSocket room', error);
          socket.disconnect(true);
        });
      });
    });
  }

  private async joinOrderRoom(socket: Socket, payload: unknown): Promise<void> {
    if (payload === null || typeof payload !== 'object') return;
    const orderId = (payload as { orderId?: unknown }).orderId;
    if (typeof orderId !== 'string') return;
    const auth = socket.handshake.auth;
    const qrToken = auth !== null && typeof auth === 'object' && typeof auth['qrToken'] === 'string'
      ? auth['qrToken'] : undefined;
    if (!qrToken) return;
    const table = await this.prisma.findTableByQrToken(qrToken);
    if (!table) return;
    const order = await this.prisma.forTenant(table.tenantId).order.findFirst({
      where: { id: orderId, tableId: table.id },
      select: { id: true },
    });
    if (order) await socket.join(`order:${order.id}`);
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

  emitOrderStatusChanged(order: { id: string; dailyOrderNumber: number; status: string; updatedAt: Date }): void {
    this.io.to(`order:${order.id}`).emit('order:status_changed', {
      id: order.id,
      dailyOrderNumber: order.dailyOrderNumber,
      status: order.status,
      estimatedReadyAt: order.status === 'COOKING'
        ? new Date(order.updatedAt.getTime() + 12 * 60_000).toISOString()
        : null,
    });
  }
}
