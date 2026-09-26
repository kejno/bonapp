import { createHash } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { Server as HttpServer } from 'node:http';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { verifyToken } from '../staff-auth/staff-jwt.util';

@Injectable()
export class MenuGateway implements OnModuleInit, OnModuleDestroy {
  private io!: Server;
  private pubClient?: Redis;
  private subClient?: Redis;
  private readonly logger = new Logger(MenuGateway.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const httpServer = this.httpAdapterHost.httpAdapter.getHttpServer() as HttpServer;
    const configuredOrigins = this.config.get<string>('CORS_ORIGIN');
    const allowedOrigins = configuredOrigins?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? false;
    this.io = new Server(httpServer, { cors: { origin: allowedOrigins } });
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (redisUrl) {
      this.pubClient = new Redis(redisUrl);
      this.subClient = this.pubClient.duplicate();
      this.io.adapter(createAdapter(this.pubClient, this.subClient));
    }
    this.io.on('connection', (socket) => this.registerHandlers(socket));
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.pubClient?.quit(), this.subClient?.quit()]);
    void this.io?.close();
  }

  private registerHandlers(socket: Socket): void {
    socket.on('join_order_room', (payload: unknown, acknowledge?: (result: unknown) => void) => {
      void this.joinOrderRoom(socket, payload).then(
        (room) => acknowledge?.({ ok: true, room }),
        (error: unknown) => { this.logger.warn(`Rejected order room join: ${String(error)}`); acknowledge?.({ ok: false }); },
      );
    });
    socket.on('join_tenant_room', (payload: unknown, acknowledge?: (result: unknown) => void) => {
      void this.joinTenantRoom(socket, payload).then(
        (room) => acknowledge?.({ ok: true, room }),
        (error: unknown) => { this.logger.warn(`Rejected tenant room join: ${String(error)}`); acknowledge?.({ ok: false }); },
      );
    });
    socket.on('order:update_status', (payload: unknown) => {
      void this.updateOrderStatus(socket, payload).catch((error: unknown) => {
        this.logger.warn(`Rejected order status update: ${String(error)}`);
        socket.emit('exception', { message: 'Unable to update order status' });
      });
    });
  }

  private async joinOrderRoom(socket: Socket, value: unknown): Promise<string> {
    const data = record(value);
    const orderId = data['orderId'];
    const token = record(socket.handshake.auth)['tableSessionToken'];
    if (typeof orderId !== 'string' || typeof token !== 'string') throw new Error('Invalid join payload');
    const session = await this.prisma.unscopedClient.tableSession.findFirst({
      where: { tokenHash: hashToken(token), expiresAt: { gt: new Date() }, revokedAt: null },
      select: { id: true, tenantId: true, tableId: true },
    });
    if (!session) throw new Error('Invalid table session');
    const order = await this.prisma.forTenant(session.tenantId).order.findFirst({
      where: { id: orderId, tableId: session.tableId, status: { notIn: ['PAID', 'CANCELLED'] } },
      select: { id: true },
    });
    if (!order) throw new Error('Order is not part of this active table session');
    const room = `order_${order.id}`;
    await socket.join(room);
    (socket.data as Record<string, unknown>)['guestSessionId'] = session.id;
    return room;
  }

  private async joinTenantRoom(socket: Socket, value: unknown): Promise<string> {
    const data = record(value);
    const auth = record(socket.handshake.auth);
    const headers = socket.handshake.headers;
    const authorization = typeof data['authorization'] === 'string' ? data['authorization'] :
      typeof auth['authorization'] === 'string' ? auth['authorization'] :
        typeof auth['token'] === 'string' ? `Bearer ${auth['token']}` : headers.authorization;
    const token = typeof authorization === 'string' ? authorization.match(/^Bearer\s+(.+)$/i)?.[1] : undefined;
    if (!token) throw new Error('Bearer token required');
    const payload = verifyToken(token, this.config.getOrThrow<string>('JWT_SECRET'));
    if (payload.type !== 'access') throw new Error('Access token required');
    const user = await this.prisma.forTenant(payload.tenantId).user.findFirst({
      where: { id: payload.userId, isActive: true, isBlocked: false, sessionVersion: payload.sessionVersion },
      select: { id: true, tenantId: true, role: true },
    });
    if (!user) throw new Error('Invalid staff session');
    const requested = data['room'];
    if (requested !== 'kitchen' && requested !== 'hall') throw new Error('Invalid tenant room');
    const room = `tenant_${user.tenantId}_${requested}`;
    await socket.join(room);
    (socket.data as Record<string, unknown>)['staff'] = { tenantId: user.tenantId, role: user.role };
    return room;
  }

  private async updateOrderStatus(socket: Socket, value: unknown): Promise<void> {
    const staff = (socket.data as Record<string, unknown>)['staff'] as { tenantId: string; role: string } | undefined;
    const data = record(value);
    if (!staff || staff.role !== 'CHEF' || typeof data['orderId'] !== 'string') throw new Error('Chef access required');
    const order = await this.prisma.forTenant(staff.tenantId).order.update({
      where: { id_tenantId: { id: data['orderId'], tenantId: staff.tenantId } },
      data: { status: 'COOKING' },
      select: { id: true, status: true, tenantId: true },
    });
    this.emitOrderStatusChanged(order.tenantId, order.id, order.status);
  }

  emitOrderCreated(tenantId: string, order: unknown): void {
    this.io.to(`tenant_${tenantId}_kitchen`).emit('order:created', order);
    this.io.to(`tenant_${tenantId}_hall`).emit('order:created', order);
  }

  emitOrderStatusChanged(tenantId: string, orderId: string, status: string): void {
    const event = { orderId, status };
    this.io.to(`order_${orderId}`).emit('order:status_changed', event);
    if (status === 'NEW' || status === 'COOKING') this.io.to(`tenant_${tenantId}_kitchen`).emit('order:status_changed', event);
    if (status === 'READY') this.io.to(`tenant_${tenantId}_hall`).emit('order:status_changed', event);
  }

  emitWaiterCalled(tenantId: string, payload: unknown): void {
    this.io.to(`tenant_${tenantId}_hall`).emit('waiter:called', payload);
  }

  async closeOrderSession(tenantId: string, tableId: string, orderId: string): Promise<void> {
    await this.prisma.forTenant(tenantId).tableSession.updateMany({
      where: { tableId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.io.in(`order_${orderId}`).disconnectSockets(true);
  }

  emitStopListChanged(tenantId: string, itemId: string, isInStopList: boolean): void {
    const event = { itemId, isInStopList };
    this.io.to(`tenant_${tenantId}_kitchen`).emit('menu:stop_list_changed', event);
    this.io.to(`tenant_${tenantId}_hall`).emit('menu:stop_list_changed', event);
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
