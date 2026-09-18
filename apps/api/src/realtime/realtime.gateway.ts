import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { OrderStatus } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { OrderService } from './order.service';
import { StaffAuthService, StaffIdentity } from './staff-auth.service';
import { TableSessionService } from './table-session.service';

type TenantRoom = 'kitchen' | 'hall';
type OrderRoomPayload = { orderId: string };
type TenantRoomPayload = { room: TenantRoom };
type UpdateStatusPayload = { orderId: string; status: OrderStatus };

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tableSessionService: TableSessionService,
    private readonly staffAuthService: StaffAuthService,
    private readonly orderService: OrderService,
  ) {}

  @SubscribeMessage('join_order_room')
  async joinOrderRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: OrderRoomPayload,
  ) {
    if (!payload?.orderId) throw new WsException('Order id is required');
    const token = this.tableSessionToken(client);
    if (!token) throw new WsException('Table session token is required');
    await this.tableSessionService.validateOrderAccess(token, payload.orderId);
    const room = this.orderRoom(payload.orderId);
    await client.join(room);
    return { room };
  }

  @SubscribeMessage('join_tenant_room')
  async joinTenantRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TenantRoomPayload,
  ) {
    if (payload?.room !== 'kitchen' && payload?.room !== 'hall')
      throw new WsException('Unknown tenant room');
    const staff = this.staff(client);
    if (staff.role !== payload.room)
      throw new WsException('Staff role cannot join this room');
    const room = this.tenantRoom(staff.tenantId, payload.room);
    await client.join(room);
    return { room };
  }

  @SubscribeMessage('order:update_status')
  async updateOrderStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: UpdateStatusPayload,
  ) {
    const staff = this.staff(client);
    if (staff.role !== 'kitchen')
      throw new WsException('Only kitchen staff can update order status');
    const order = await this.orderService.updateStatus(
      payload.orderId,
      staff.tenantId,
      payload.status,
    );
    this.emitOrderStatusChanged(order);
    return order;
  }

  emitOrderCreated(order: { id: string; tenantId: string }) {
    this.server
      .to(this.tenantRoom(order.tenantId, 'kitchen'))
      .to(this.tenantRoom(order.tenantId, 'hall'))
      .emit('order:created', order);
  }

  emitOrderStatusChanged(order: {
    id: string;
    tenantId: string;
    status: OrderStatus;
  }) {
    this.server
      .to(this.orderRoom(order.id))
      .emit('order:status_changed', order);
    const target = order.status === 'READY' ? 'hall' : 'kitchen';
    this.server
      .to(this.tenantRoom(order.tenantId, target))
      .emit('order:status_changed', order);
  }

  emitWaiterCalled(tenantId: string, payload: unknown) {
    this.server
      .to(this.tenantRoom(tenantId, 'hall'))
      .emit('waiter:called', payload);
  }

  emitStopListChanged(tenantId: string, payload: unknown) {
    this.server
      .to(this.tenantRoom(tenantId, 'kitchen'))
      .to(this.tenantRoom(tenantId, 'hall'))
      .emit('menu:stop_list_changed', payload);
  }

  private staff(client: Socket): StaffIdentity {
    return this.staffAuthService.authenticate(this.bearerToken(client));
  }

  private tableSessionToken(client: Socket): string | undefined {
    const auth = client.handshake.auth as
      { tableSessionToken?: unknown } | undefined;
    const authToken = auth?.tableSessionToken;
    return typeof authToken === 'string' ? authToken : this.bearerToken(client);
  }

  private bearerToken(client: Socket): string | undefined {
    const headers = (client.handshake.headers ?? {}) as unknown as Record<
      string,
      string | string[] | undefined
    >;
    const header = headers.authorization;
    const token = Array.isArray(header) ? header[0] : header;
    if (typeof token === 'string' && token.startsWith('Bearer '))
      return token.slice(7);
    const query = client.handshake.query as unknown as
      { token?: unknown } | undefined;
    const queryToken = query?.token;
    return typeof queryToken === 'string' ? queryToken : undefined;
  }

  private orderRoom(orderId: string) {
    return `order_${orderId}`;
  }

  private tenantRoom(tenantId: string, room: TenantRoom) {
    return `tenant_${tenantId}_${room}`;
  }
}
