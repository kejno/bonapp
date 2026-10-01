import { createHash } from 'node:crypto';
import { forwardRef, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { Server as HttpServer } from 'node:http';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { verifyToken } from '../staff-auth/staff-jwt.util';
import { ServiceMode, UserRole } from '@prisma/client';
import { OrdersService } from '../orders/orders.service';

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
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
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
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (redisUrl) {
      this.pubClient = new Redis(redisUrl);
      this.subClient = this.pubClient.duplicate();
      this.io.adapter(createAdapter(this.pubClient, this.subClient));
    }
    this.io.on('connection', (socket) => {
      this.registerHandlers(socket);
      const auth = record(socket.handshake.auth);
      if (typeof auth['accessToken'] === 'string') {
        void this.joinTenantRoom(socket, {
          room: 'hall',
          authorization: `Bearer ${auth['accessToken']}`,
        }).catch((error: unknown) => {
          this.logger.warn(`Rejected staff hall connection: ${String(error)}`);
          socket.disconnect(true);
        });
      }
    });
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
    socket.on('join_table_room', (acknowledge?: (result: unknown) => void) => {
      void this.joinTableRoom(socket).then(
        (room) => acknowledge?.({ ok: true, room }),
        (error: unknown) => { this.logger.warn(`Rejected table room join: ${String(error)}`); acknowledge?.({ ok: false }); },
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
    const auth = record(socket.handshake.auth);
    if (typeof orderId !== 'string') throw new Error('Invalid join payload');
    const qrToken = auth['qrToken'];
    const sessionToken = auth['tableSessionToken'];
    let tenantId: string;
    let tableId: string;
    if (typeof qrToken === 'string') {
      const table = await this.prisma.findTableByQrToken(qrToken);
      if (!table) throw new Error('Invalid table session');
      tenantId = table.tenantId;
      tableId = table.id;
    } else if (typeof sessionToken === 'string') {
      const session = await this.prisma.unscopedClient.tableSession.findFirst({
        where: { tokenHash: hashToken(sessionToken), expiresAt: { gt: new Date() }, revokedAt: null },
        select: { id: true, tenantId: true, tableId: true },
      });
      if (!session) throw new Error('Invalid table session');
      tenantId = session.tenantId;
      tableId = session.tableId;
      (socket.data as Record<string, unknown>)['guestSessionId'] = session.id;
    } else throw new Error('Invalid table session');
    const order = await this.prisma.forTenant(tenantId).order.findFirst({
      where: { id: orderId, tableId, status: { notIn: ['PAID', 'CANCELLED'] } },
      select: { id: true },
    });
    if (!order) throw new Error('Order is not part of this active table session');
    const room = `order_${order.id}`;
    await socket.join(room);
    return room;
  }

  private async joinTenantRoom(socket: Socket, value: unknown): Promise<string> {
    const data = record(value);
    const auth = record(socket.handshake.auth);
    const headers = socket.handshake.headers;
    const query = record(socket.handshake.query);
    const authorization = typeof data['authorization'] === 'string' ? data['authorization'] :
      typeof auth['authorization'] === 'string' ? auth['authorization'] :
        typeof auth['accessToken'] === 'string' ? `Bearer ${auth['accessToken']}` :
        typeof auth['token'] === 'string' ? `Bearer ${auth['token']}` :
          typeof query['token'] === 'string' ? `Bearer ${query['token']}` :
            typeof query['authorization'] === 'string' ? query['authorization'] : headers.authorization;
    const token = typeof authorization === 'string' ? authorization.match(/^Bearer\s+(.+)$/i)?.[1] : undefined;
    if (!token) throw new Error('Bearer token required');
    const payload = verifyToken(token, this.config.getOrThrow<string>('JWT_SECRET'));
    if (payload.type !== 'access') throw new Error('Access token required');
    const user = await this.prisma.forTenant(payload.tenantId).user.findFirst({
      where: { id: payload.userId, isActive: true, isBlocked: false, sessionVersion: payload.sessionVersion },
      select: { id: true, tenantId: true, role: true },
    });
    if (!user) throw new Error('Invalid staff session');
    const tenant = await this.prisma.forTenant(payload.tenantId).tenant.findUnique({
      where: { id: payload.tenantId },
      select: { status: true, isActive: true },
    });
    if (!tenant || tenant.status === 'BLOCKED' || !tenant.isActive) throw new Error('Tenant is blocked');
    const requested = data['room'];
    if (requested !== 'kitchen' && requested !== 'hall') throw new Error('Invalid tenant room');
    if (
      requested === 'kitchen' &&
      user.role !== UserRole.CHEF &&
      user.role !== UserRole.OWNER &&
      user.role !== UserRole.MANAGER
    ) throw new Error('Kitchen access required');
    const room = `tenant_${user.tenantId}_${requested}`;
    await socket.join(room);
    await socket.join(`tenant:${user.tenantId}`);
    (socket.data as Record<string, unknown>)['staff'] = { tenantId: user.tenantId, userId: user.id, role: user.role };
    return room;
  }

  private async joinTableRoom(socket: Socket): Promise<string> {
    const auth = record(socket.handshake.auth);
    const token = auth['tableSessionToken'];
    const qrToken = auth['qrToken'];
    if (typeof token !== 'string' || typeof qrToken !== 'string') throw new Error('Table session required');
    const table = await this.prisma.findTableByQrToken(qrToken);
    if (!table) throw new Error('Invalid table');
    const session = await this.prisma.forTenant(table.tenantId).tableSession.findFirst({
      where: { tokenHash: hashToken(token), expiresAt: { gt: new Date() }, revokedAt: null },
      select: { id: true },
    });
    if (!session) throw new Error('Invalid table session');
    const room = `table:${session.id}`;
    await socket.join(room);
    return room;
  }

  emitPaymentStatusChanged(
    tenantId: string,
    tableId: string,
    _guestSessionId: string | null,
    payload: { orderId: string; paymentId: string; status: string; method: string },
  ): void {
    this.io.to(`tenant:${tenantId}`).emit('payment.status_changed', payload);
    void this.prisma.forTenant(tenantId).tableSession.findMany({
      where: {
        tableId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    }).then((sessions) => {
      for (const session of sessions) this.io.to(`table:${session.id}`).emit('payment.status_changed', payload);
    }).catch((error: unknown) => this.logger.error(`Could not route payment update: ${String(error)}`));
  }

  disconnectTenantStaff(tenantId: string): void {
    this.io.in(`tenant_${tenantId}_hall`).disconnectSockets(true);
    this.io.in(`tenant_${tenantId}_kitchen`).disconnectSockets(true);
  }

  private async updateOrderStatus(socket: Socket, value: unknown): Promise<void> {
    const staff = (socket.data as Record<string, unknown>)['staff'] as { tenantId: string; userId: string; role: string } | undefined;
    const data = record(value);
    if (
      !staff || staff.role !== UserRole.CHEF ||
      typeof data['orderId'] !== 'string' ||
      typeof data['department'] !== 'string'
    ) throw new Error('Chef access and department are required');
    const tenant = await this.prisma.forTenant(staff.tenantId).tenant.findUnique({
      where: { id: staff.tenantId },
      select: { status: true, isActive: true },
    });
    if (!tenant || tenant.status === 'BLOCKED' || !tenant.isActive) throw new Error('Tenant is blocked');
    const order = await this.ordersService.updateKitchenStatusForTenant(
      staff.tenantId, data['orderId'], 'COOKING', data['department'], staff.userId, UserRole.CHEF,
    );
    this.emitOrderStatusChanged(staff.tenantId, order.id, order.status, order);
  }

  emitOrderCreated(tenantId: string, order: unknown): void {
    this.io.to(`tenant_${tenantId}_kitchen`).emit('order:created', order);
    this.io.to(`tenant_${tenantId}_hall`).emit('order:created', order);
  }

  emitOrderStatusChanged(tenantId: string, orderId: string, status: string, details?: { dailyOrderNumber?: number; updatedAt?: Date }): void {
    const event: Record<string, unknown> = {
      id: orderId,
      orderId,
      status,
    };
    if (details?.updatedAt) event['updatedAt'] = details.updatedAt.toISOString();
    if (details?.dailyOrderNumber !== undefined) event['dailyOrderNumber'] = details.dailyOrderNumber;
    if (details?.updatedAt) {
      event['estimatedReadyAt'] = status === 'COOKING'
        ? new Date(details.updatedAt.getTime() + 12 * 60_000).toISOString()
        : null;
    }
    this.io.to(`order_${orderId}`).emit('order:status_changed', event);
    if (status === 'NEW' || status === 'COOKING') this.io.to(`tenant_${tenantId}_kitchen`).emit('order:status_changed', event);
    if (status === 'READY') this.io.to(`tenant_${tenantId}_hall`).emit('order:status_changed', event);
  }

  emitWaiterCalled(
    tenantId: string,
    payload: { tableId: string; tableNumber: number; reason: 'NEED_BILL' | 'CALL_STAFF' },
  ): void {
    this.io.to(`tenant_${tenantId}_hall`).emit('waiter:called', payload);
  }

  async closeOrderSession(tenantId: string, tableId: string, orderId: string): Promise<void> {
    await this.prisma.forTenant(tenantId).tableSession.updateMany({
      where: { tableId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.io.in(`order_${orderId}`).disconnectSockets(true);
  }

  emitKitchenOrder(tenantId: string, event: 'order:created' | 'order:updated', order: unknown): void {
    this.io.to(`tenant_${tenantId}_kitchen`).emit(event, order);
  }

  emitServiceModeChanged(tenantId: string, serviceMode: ServiceMode): void {
    const event = { serviceMode };
    this.io.to(`tenant_${tenantId}_kitchen`).emit('tenant:service_mode_changed', event);
    this.io.to(`tenant_${tenantId}_hall`).emit('tenant:service_mode_changed', event);
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
