import type { HttpAdapterHost } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MenuGateway } from './menu.gateway';

describe('MenuGateway', () => {
  function makeGateway() {
    const findFirst = jest.fn();
    const prisma = {
      findTableByQrToken: jest.fn(),
      forTenant: jest.fn(() => ({ order: { findFirst } })),
    };
    const gateway = new MenuGateway(
      {} as HttpAdapterHost,
      prisma as unknown as PrismaService,
      { get: jest.fn() } as unknown as ConfigService,
    );
    const emitFn = jest.fn();
    const toFn = jest.fn().mockReturnValue({ emit: emitFn });
    (gateway as unknown as Record<string, unknown>)['io'] = { to: toFn };
    return { gateway, prisma, toFn, emitFn, findFirst };
  }

  it('joins only the tenant resolved from the authenticated QR token', async () => {
    const { gateway, prisma } = makeGateway();
    const join = jest.fn();
    const disconnect = jest.fn();
    prisma.findTableByQrToken.mockResolvedValue({ tenantId: 'tenant-1' });

    await (
      gateway as unknown as { joinTenantRoom(socket: unknown): Promise<void> }
    ).joinTenantRoom({ handshake: { auth: { qrToken: 'valid-qr-token' } }, join, disconnect });

    expect(prisma.findTableByQrToken).toHaveBeenCalledWith('valid-qr-token');
    expect(join).toHaveBeenCalledWith('tenant:tenant-1');
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('disconnects a socket without a valid QR token instead of trusting a tenant query', async () => {
    const { gateway, prisma } = makeGateway();
    const join = jest.fn();
    const disconnect = jest.fn();

    await (
      gateway as unknown as { joinTenantRoom(socket: unknown): Promise<void> }
    ).joinTenantRoom({
      handshake: { auth: {}, query: { tenantId: 'another-tenant' } },
      join,
      disconnect,
    });

    expect(prisma.findTableByQrToken).not.toHaveBeenCalled();
    expect(join).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it('logs a QR lookup failure before disconnecting the socket', () => {
    const { gateway } = makeGateway();
    const disconnect = jest.fn();
    const error = new Error('database timeout');
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    (gateway as unknown as {
      handleJoinTenantRoomError(socket: unknown, error: unknown): void;
    }).handleJoinTenantRoomError({ disconnect }, error);

    expect(loggerError).toHaveBeenCalledWith(
      'Unable to join menu WebSocket tenant room',
      error,
    );
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it('emits menu:stop_list_changed to the correct tenant room', () => {
    const { gateway, toFn, emitFn } = makeGateway();

    gateway.emitStopListChanged('tenant-1', 'item-42', true);

    expect(toFn).toHaveBeenCalledWith('tenant:tenant-1');
    expect(emitFn).toHaveBeenCalledWith('menu:stop_list_changed', {
      itemId: 'item-42',
      isInStopList: true,
    });
  });

  it('emits isInStopList false when the item is removed from the stop list', () => {
    const { gateway, emitFn } = makeGateway();

    gateway.emitStopListChanged('tenant-1', 'item-42', false);

    expect(emitFn).toHaveBeenCalledWith('menu:stop_list_changed', {
      itemId: 'item-42',
      isInStopList: false,
    });
  });

  it('routes events to separate rooms for different tenants', () => {
    const { gateway, toFn } = makeGateway();

    gateway.emitStopListChanged('tenant-a', 'item-1', true);
    gateway.emitStopListChanged('tenant-b', 'item-2', false);

    expect(toFn).toHaveBeenCalledWith('tenant:tenant-a');
    expect(toFn).toHaveBeenCalledWith('tenant:tenant-b');
    expect(toFn).toHaveBeenCalledTimes(2);
  });

  it('joins an order room only when the authenticated table owns that order', async () => {
    const { gateway, prisma, findFirst } = makeGateway();
    const join = jest.fn();
    prisma.findTableByQrToken.mockResolvedValue({ id: 'table-1', tenantId: 'tenant-1' });
    findFirst.mockResolvedValue({ id: 'order-1' });

    await (gateway as unknown as { joinOrderRoom(socket: unknown, payload: unknown): Promise<void> }).joinOrderRoom({
      handshake: { auth: { qrToken: 'qr-token' } }, join,
    }, { orderId: 'order-1' });

    expect(findFirst).toHaveBeenCalledWith({ where: { id: 'order-1', tableId: 'table-1' }, select: { id: true } });
    expect(join).toHaveBeenCalledWith('order:order-1');
  });

  it('emits only the guest status fields to the order room', () => {
    const { gateway, toFn, emitFn } = makeGateway();
    const updatedAt = new Date('2026-09-26T12:00:00.000Z');

    gateway.emitOrderStatusChanged({ id: 'order-1', dailyOrderNumber: 48, status: 'COOKING', updatedAt });

    expect(toFn).toHaveBeenCalledWith('order:order-1');
    expect(emitFn).toHaveBeenCalledWith('order:status_changed', {
      id: 'order-1', dailyOrderNumber: 48, status: 'COOKING', estimatedReadyAt: '2026-09-26T12:12:00.000Z',
    });
  });
});
