import { WsException } from '@nestjs/websockets';
import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeGateway', () => {
  const tableSessionService = {
    validateOrderAccess: jest.fn(),
  };
  const staffAuthService = {
    authenticate: jest.fn(),
  };
  const orderService = {
    updateStatus: jest.fn(),
  };

  let gateway: RealtimeGateway;

  beforeEach(() => {
    jest.resetAllMocks();
    gateway = new RealtimeGateway(
      tableSessionService as never,
      staffAuthService as never,
      orderService as never,
    );
  });

  it('adds a guest only to the authorized order room', async () => {
    const client = {
      handshake: { auth: { tableSessionToken: 'session-token' } },
      join: jest.fn(),
    };
    tableSessionService.validateOrderAccess.mockResolvedValue(undefined);

    await expect(
      gateway.joinOrderRoom(client as never, { orderId: 'order-1' }),
    ).resolves.toEqual({
      room: 'order_order-1',
    });

    expect(tableSessionService.validateOrderAccess).toHaveBeenCalledWith(
      'session-token',
      'order-1',
    );
    expect(client.join).toHaveBeenCalledWith('order_order-1');
  });

  it('rejects a guest without a valid table session token', async () => {
    const client = { handshake: { auth: {} }, join: jest.fn() };

    await expect(
      gateway.joinOrderRoom(client as never, { orderId: 'order-1' }),
    ).rejects.toBeInstanceOf(WsException);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('adds authenticated kitchen staff only to their tenant kitchen room', async () => {
    const client = {
      handshake: { headers: { authorization: 'Bearer staff-token' } },
      join: jest.fn(),
      data: {},
    };
    staffAuthService.authenticate.mockReturnValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      role: 'kitchen',
    });

    await expect(
      gateway.joinTenantRoom(client as never, { room: 'kitchen' }),
    ).resolves.toEqual({
      room: 'tenant_tenant-1_kitchen',
    });
    expect(client.join).toHaveBeenCalledWith('tenant_tenant-1_kitchen');
  });

  it('rejects staff trying to join a room outside their role', async () => {
    const client = {
      handshake: { headers: { authorization: 'Bearer staff-token' } },
      join: jest.fn(),
      data: {},
    };
    staffAuthService.authenticate.mockReturnValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      role: 'kitchen',
    });

    await expect(
      gateway.joinTenantRoom(client as never, { room: 'hall' }),
    ).rejects.toBeInstanceOf(WsException);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('updates an order status for authenticated kitchen staff and notifies its room', async () => {
    const client = {
      handshake: { headers: { authorization: 'Bearer staff-token' } },
      data: {},
    };
    const emit = jest.fn();
    gateway.server = { to: jest.fn().mockReturnValue({ emit }) } as never;
    staffAuthService.authenticate.mockReturnValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      role: 'kitchen',
    });
    orderService.updateStatus.mockResolvedValue({
      id: 'order-1',
      tenantId: 'tenant-1',
      status: 'PREPARING',
    });

    await gateway.updateOrderStatus(client as never, {
      orderId: 'order-1',
      status: 'PREPARING',
    });

    expect(orderService.updateStatus).toHaveBeenCalledWith(
      'order-1',
      'tenant-1',
      'PREPARING',
    );
    expect(emit).toHaveBeenCalledWith('order:status_changed', {
      id: 'order-1',
      tenantId: 'tenant-1',
      status: 'PREPARING',
    });
  });
});
