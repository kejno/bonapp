import type { HttpAdapterHost } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { buildTokenPair } from '../staff-auth/staff-jwt.util';
import { MenuGateway } from './menu.gateway';

type TestSocket = { handshake: { auth: Record<string, unknown>; headers: Record<string, unknown>; query: Record<string, unknown> }; join: jest.Mock; data: Record<string, unknown> };

describe('MenuGateway event routing', () => {
  function makeGateway() {
    const emissions: Array<{ room: string; event: string; payload: unknown }> = [];
    const gateway = new MenuGateway(
      {} as HttpAdapterHost,
      {} as PrismaService,
      {} as ConfigService,
      { updateKitchenStatusForTenant: jest.fn() } as never,
    );
    const to = jest.fn((room: string) => ({
      emit: (event: string, payload: unknown) => emissions.push({ room, event, payload }),
    }));
    (gateway as unknown as { io: { to: typeof to } }).io = { to };
    return { gateway, emissions, to };
  }

  it('accepts a staff bearer token from the handshake query', async () => {
    const secret = 'gateway-test-secret';
    const { accessToken } = buildTokenPair('staff-1', 'tenant-1', UserRole.CHEF, secret);
    const join = jest.fn();
    const prisma = {
      forTenant: () => ({
        user: { findFirst: jest.fn().mockResolvedValue({ id: 'staff-1', tenantId: 'tenant-1', role: UserRole.CHEF }) },
      }),
    };
    const gateway = new MenuGateway(
      {} as HttpAdapterHost,
      prisma as unknown as PrismaService,
      { getOrThrow: () => secret } as unknown as ConfigService,
      { updateKitchenStatusForTenant: jest.fn() } as never,
    );
    const socket: TestSocket = {
      handshake: { auth: {}, headers: {}, query: { token: accessToken } },
      join,
      data: {},
    };

    await (gateway as unknown as { joinTenantRoom(socket: TestSocket, payload: unknown): Promise<string> })
      .joinTenantRoom(socket, { room: 'kitchen' });

    expect(join).toHaveBeenCalledWith('tenant_tenant-1_kitchen');
  });

  it('sends a new order to kitchen and hall rooms', () => {
    const { gateway, emissions } = makeGateway();
    const order = { id: 'order-1' };

    gateway.emitOrderCreated('tenant-1', order);

    expect(emissions).toEqual([
      { room: 'tenant_tenant-1_kitchen', event: 'order:created', payload: order },
      { room: 'tenant_tenant-1_hall', event: 'order:created', payload: order },
    ]);
  });

  it('always sends status changes to the order room and routes cooking to kitchen', () => {
    const { gateway, emissions } = makeGateway();

    gateway.emitOrderStatusChanged('tenant-1', 'order-1', 'COOKING');

    expect(emissions).toEqual([
      { room: 'order_order-1', event: 'order:status_changed', payload: { id: 'order-1', orderId: 'order-1', status: 'COOKING' } },
      { room: 'tenant_tenant-1_kitchen', event: 'order:status_changed', payload: { id: 'order-1', orderId: 'order-1', status: 'COOKING' } },
    ]);
  });

  it('routes ready status to the hall and waiter calls only to the hall', () => {
    const { gateway, emissions } = makeGateway();
    gateway.emitOrderStatusChanged('tenant-1', 'order-2', 'READY');
    gateway.emitWaiterCalled('tenant-1', { tableId: 'table-1', tableNumber: 4, reason: 'NEED_BILL' });

    expect(emissions.map(({ room }) => room)).toEqual([
      'order_order-2', 'tenant_tenant-1_hall', 'tenant_tenant-1_hall',
    ]);
    expect(emissions[2]).toMatchObject({ event: 'waiter:called', payload: { tableId: 'table-1' } });
  });

  it('routes stop list changes to both staff rooms', () => {
    const { gateway, emissions } = makeGateway();
    gateway.emitStopListChanged('tenant-1', 'item-42', false);

    expect(emissions.map(({ room }) => room)).toEqual([
      'tenant_tenant-1_kitchen', 'tenant_tenant-1_hall',
    ]);
    expect(emissions[0]).toMatchObject({ event: 'menu:stop_list_changed', payload: { itemId: 'item-42', isInStopList: false } });
  });

  it('routes service mode changes to both staff rooms', () => {
    const { gateway, emissions } = makeGateway();

    gateway.emitServiceModeChanged('tenant-1', 'ORDER_AND_PAY');

    expect(emissions).toEqual([
      { room: 'tenant_tenant-1_kitchen', event: 'tenant:service_mode_changed', payload: { serviceMode: 'ORDER_AND_PAY' } },
      { room: 'tenant_tenant-1_hall', event: 'tenant:service_mode_changed', payload: { serviceMode: 'ORDER_AND_PAY' } },
    ]);
  });
});
