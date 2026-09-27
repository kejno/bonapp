import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { UserRole } from '@prisma/client';
import { MenuGateway } from '../src/menu/menu.gateway';
import { OrdersService } from '../src/orders/orders.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildTokenPair } from '../src/staff-auth/staff-jwt.util';

const jwtSecret = 'e2e-test-jwt-secret';

describe('waiter:called tenant isolation', () => {
  let app: INestApplication;
  let tenantSocket: Socket | undefined;
  let otherTenantSocket: Socket | undefined;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MenuGateway,
        { provide: OrdersService, useValue: {} },
        {
          provide: ConfigService,
          useValue: { get: () => undefined, getOrThrow: () => jwtSecret },
        },
        {
          provide: PrismaService,
          useValue: {
            forTenant: (tenantId: string) => ({
              user: {
                findFirst: () => Promise.resolve({
                  id: `staff-${tenantId}`,
                  tenantId,
                  role: UserRole.MANAGER,
                  sessionVersion: 0,
                }),
              },
            }),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    tenantSocket?.disconnect();
    otherTenantSocket?.disconnect();
    await app?.close();
  });

  it('delivers a call only to staff connected to the event tenant hall', async () => {
    const address = (app.getHttpServer() as unknown as { address(): AddressInfo }).address();
    const connectStaff = (tenantId: string) => io(`http://127.0.0.1:${address.port}`, {
      auth: { accessToken: buildTokenPair(`staff-${tenantId}`, tenantId, UserRole.MANAGER, jwtSecret).accessToken },
      transports: ['websocket'],
    });
    tenantSocket = connectStaff('tenant-1');
    otherTenantSocket = connectStaff('tenant-2');
    await Promise.all([waitForConnection(tenantSocket), waitForConnection(otherTenantSocket)]);

    const tenantDelivery = new Promise<unknown>((resolve) => tenantSocket?.once('waiter:called', resolve));
    const otherTenantEvents: unknown[] = [];
    otherTenantSocket?.on('waiter:called', (event) => otherTenantEvents.push(event));

    app.get(MenuGateway).emitWaiterCalled('tenant-1', {
      tableId: 'table-4',
      tableNumber: 4,
      reason: 'NEED_BILL',
    });

    await expect(tenantDelivery).resolves.toEqual({
      tableId: 'table-4',
      tableNumber: 4,
      reason: 'NEED_BILL',
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(otherTenantSocket?.connected).toBe(true);
    expect(otherTenantEvents).toHaveLength(0);
  }, 10_000);
});

function waitForConnection(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Staff socket connection timed out')), 5_000);
    socket.once('connect', () => { clearTimeout(timeout); resolve(); });
    socket.once('connect_error', (error: Error) => { clearTimeout(timeout); reject(error); });
  });
}
