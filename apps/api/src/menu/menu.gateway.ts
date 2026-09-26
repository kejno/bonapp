import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { Server as HttpServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { verifyToken } from '../staff-auth/staff-jwt.util';
import { ServiceMode, UserRole } from '@prisma/client';

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
    const httpServer =
      this.httpAdapterHost.httpAdapter.getHttpServer() as HttpServer;
    const configuredOrigins = this.config.get<string>('CORS_ORIGIN');
    const allowedOrigins =
      configuredOrigins
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
    const accessToken =
      auth !== null &&
      typeof auth === 'object' &&
      typeof auth['accessToken'] === 'string'
        ? auth['accessToken']
        : undefined;
    if (accessToken) {
      try {
        const payload = verifyToken(
          accessToken,
          this.config.getOrThrow<string>('JWT_SECRET'),
        );
        if (payload.type !== 'access') throw new Error('Invalid token type');
        const user = await this.prisma
          .forTenant(payload.tenantId)
          .user.findFirst({
            where: {
              id: payload.userId,
              isActive: true,
              isBlocked: false,
              sessionVersion: payload.sessionVersion,
            },
            select: { role: true },
          });
        const kdsRoles: UserRole[] = [
          UserRole.CHEF,
          UserRole.OWNER,
          UserRole.MANAGER,
        ];
        if (!user || !kdsRoles.includes(user.role))
          throw new Error('KDS access denied');
        await socket.join(`tenant_kitchen:${payload.tenantId}`);
        return;
      } catch {
        socket.disconnect(true);
        return;
      }
    }
    const qrToken =
      auth !== null &&
      typeof auth === 'object' &&
      typeof auth['qrToken'] === 'string'
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

  emitKitchenOrder(
    tenantId: string,
    event: 'order:created' | 'order:updated',
    order: unknown,
  ): void {
    this.io.to(`tenant_kitchen:${tenantId}`).emit(event, order);
  }

  emitServiceModeChanged(tenantId: string, serviceMode: ServiceMode): void {
    this.io.to(`tenant:${tenantId}`).emit('tenant:service_mode_changed', { serviceMode });
  }
}
