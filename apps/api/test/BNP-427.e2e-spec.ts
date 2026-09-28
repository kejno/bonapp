import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { AuthGuard } from '../src/auth/auth.guard';
import { GuestSessionGuard } from '../src/guest-session/guest-session.guard';
import { MenuGateway } from '../src/menu/menu.gateway';
import { OrdersService } from '../src/orders/orders.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { WaiterCallController } from '../src/waiter-call/waiter-call.controller';
import { WaiterCallService } from '../src/waiter-call/waiter-call.service';
import { buildTokenPair } from '../src/staff-auth/staff-jwt.util';

const jwtSecret = 'e2e-test-jwt-secret';
const staffToken = buildTokenPair('staff-1', 'tenant-1', UserRole.MANAGER, jwtSecret).accessToken;

describe('POST /api/v1/guest/call-waiter WebSocket integration', () => {
  let app: INestApplication;
  let socket: Socket | undefined;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [WaiterCallController],
      providers: [
        WaiterCallService,
        MenuGateway,
        { provide: OrdersService, useValue: {} },
        GuestSessionGuard,
        {
          provide: ConfigService,
          useValue: { get: () => undefined, getOrThrow: () => jwtSecret },
        },
        {
          provide: AuthGuard,
          useValue: { getTenantIdForSocketToken: () => Promise.resolve('tenant-1') },
        },
        {
          provide: PrismaService,
          useValue: {
            findTableByQrToken: (token: string) => Promise.resolve(token === 'qr-1'
              ? { id: 'table-1', tenantId: 'tenant-1' }
              : null),
            forTenant: () => ({
              table: { findUnique: () => Promise.resolve({ tableNumber: 4 }) },
              user: { findFirst: () => Promise.resolve({ id: 'staff-1', tenantId: 'tenant-1', role: UserRole.MANAGER }) },
            }),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    socket?.disconnect();
    await app?.close();
  });

  it('delivers the guest call to an authenticated staff member in that tenant hall', async () => {
    const address = (app.getHttpServer() as unknown as { address(): AddressInfo }).address();
    socket = io(`http://127.0.0.1:${address.port}`, {
      auth: { accessToken: staffToken },
      transports: ['websocket'],
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Staff socket connection timed out')), 5_000);
      socket?.once('connect', () => { clearTimeout(timeout); resolve(); });
      socket?.once('connect_error', (error: Error) => { clearTimeout(timeout); reject(error); });
    });
    const delivered = new Promise<unknown>((resolve) => socket?.once('waiter:called', resolve));

    await request(app.getHttpServer() as never)
      .post('/api/v1/guest/call-waiter')
      .set('X-QR-Token', 'qr-1')
      .send({ tableId: 'spoofed-table', reason: 'NEED_BILL' })
      .expect(201)
      .expect({ success: true });

    await expect(delivered).resolves.toEqual({
      tableId: 'table-1',
      tableNumber: 4,
      reason: 'NEED_BILL',
    });
  }, 10_000);
});
