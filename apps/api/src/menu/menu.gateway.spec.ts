import type { HttpAdapterHost } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MenuGateway } from './menu.gateway';

describe('MenuGateway event routing', () => {
  function makeGateway() {
    const emissions: Array<{ room: string; event: string; payload: unknown }> = [];
    const gateway = new MenuGateway(
      {} as HttpAdapterHost,
      {} as PrismaService,
      {} as ConfigService,
    );
    const to = jest.fn((room: string) => ({
      emit: (event: string, payload: unknown) => emissions.push({ room, event, payload }),
    }));
    (gateway as unknown as { io: { to: typeof to } }).io = { to };
    return { gateway, emissions, to };
  }

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
      { room: 'order_order-1', event: 'order:status_changed', payload: { orderId: 'order-1', status: 'COOKING' } },
      { room: 'tenant_tenant-1_kitchen', event: 'order:status_changed', payload: { orderId: 'order-1', status: 'COOKING' } },
    ]);
  });

  it('routes ready status to the hall and waiter calls only to the hall', () => {
    const { gateway, emissions } = makeGateway();
    gateway.emitOrderStatusChanged('tenant-1', 'order-2', 'READY');
    gateway.emitWaiterCalled('tenant-1', { tableId: 'table-1' });

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
});
