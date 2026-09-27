import { createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server as HttpServer } from 'node:http';
import type { Socket as NetSocket } from 'node:net';
import { io, Socket } from 'socket.io-client';

jest.mock('../src/guest-session/guest-session.module', () => ({
  GuestSessionModule: class GuestSessionModule {},
}));

import { AppModule } from '../src/app.module';
import { MenuGateway } from '../src/menu/menu.gateway';
import { MenuCacheTestFixture, prepareGatewayShutdown } from './menu-cache-test.fixture';
import { ShiftService } from '../src/staff/shift.service';

describe('BNP-422: Redis adapter cross-instance delivery', () => {
  const fixture = new MenuCacheTestFixture();
  let secondApp: INestApplication | undefined;
  let socket: Socket | undefined;
  const serverConnections = new Set<NetSocket>();

  beforeAll(async () => fixture.start({ redisAdapter: true }), 120_000);
  afterEach(async () => { await disconnectSocket(socket); socket = undefined; });
  afterAll(async () => {
    if (secondApp) await prepareGatewayShutdown(secondApp.get(MenuGateway));
    await secondApp?.close();
    for (const connection of serverConnections) connection.destroy();
    await fixture.stop();
  });

  it('delivers a tenant event from one Gateway instance to a subscriber on another', async () => {
    const user = await fixture.prisma.user.create({
      data: { tenantId: fixture.tenantId, email: `${fixture.tenantId}@redis-test.local`, passwordHash: 'unused', fullName: 'Redis staff', role: 'OWNER', mustChangePassword: false },
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ShiftService)
      .useValue({})
      .compile();
    secondApp = module.createNestApplication();
    secondApp.setGlobalPrefix('api/v1');
    const httpServer = secondApp.getHttpServer() as HttpServer;
    httpServer.on('connection', (connection: NetSocket) => {
      serverConnections.add(connection);
      connection.once('close', () => serverConnections.delete(connection));
    });
    await secondApp.init();
    await secondApp.listen(0, '127.0.0.1');
    const address = (secondApp.getHttpServer() as HttpServer).address();
    if (!address || typeof address === 'string') throw new Error('Second HTTP server did not start');
    socket = io(`http://127.0.0.1:${address.port}`, { forceNew: true, transports: ['websocket'] });
    await waitForConnect(socket);
    await joinTenantRoom(socket, fixture.tenantId, user.id);
    const event = waitForStopListEvent(socket);

    fixture.app.get(MenuGateway).emitStopListChanged(fixture.tenantId, 'redis-item', true);

    await expect(event).resolves.toEqual({ itemId: 'redis-item', isInStopList: true });
  }, 30_000);
});

function waitForConnect(socket: Socket): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
}

function joinTenantRoom(socket: Socket, tenantId: string, userId: string): Promise<void> {
  return new Promise((resolve, reject) => socket.emit('join_tenant_room', {
    room: 'kitchen', authorization: `Bearer ${staffToken(tenantId, userId)}`,
  }, (result: { ok: boolean }) => result.ok ? resolve() : reject(new Error('Staff could not join the kitchen room'))));
}

function staffToken(tenantId: string, userId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: userId, tenantId, userId, role: 'OWNER', sessionVersion: 0, type: 'access', jti: 'redis-test', exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
  const signature = createHmac('sha256', 'menu-cache-e2e-secret').update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function waitForStopListEvent(socket: Socket): Promise<unknown> {
  return new Promise((resolve) => socket.once('menu:stop_list_changed', resolve));
}

async function disconnectSocket(socket: Socket | undefined): Promise<void> {
  if (!socket || !socket.connected) {
    socket?.disconnect();
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), 1_000);
    socket.once('disconnect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.disconnect();
  });
}
