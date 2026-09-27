import { createHmac } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { io, Socket } from 'socket.io-client';

jest.mock('../src/guest-session/guest-session.module', () => ({
  GuestSessionModule: class GuestSessionModule {},
}));

import { MenuGateway } from '../src/menu/menu.gateway';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-420: tenant staff room authorization and isolation', () => {
  const fixture = new MenuCacheTestFixture();
  let ownSocket: Socket | undefined;
  let otherSocket: Socket | undefined;

  beforeAll(async () => fixture.start({ redisAdapter: false }), 120_000);
  afterEach(async () => {
    await Promise.all([disconnectSocket(ownSocket), disconnectSocket(otherSocket)]);
    ownSocket = undefined; otherSocket = undefined;
  });
  afterAll(async () => fixture.stop());

  it('joins only the staff member tenant room and receives no other tenant events', async () => {
    const otherTenantId = `other-${fixture.tenantId}`;
    await fixture.prisma.tenant.create({ data: { id: otherTenantId, slug: otherTenantId, name: 'Other' } });
    const ownUser = await fixture.prisma.user.create({
      data: { tenantId: fixture.tenantId, email: `${fixture.tenantId}@test.local`, passwordHash: 'unused', fullName: 'Staff', role: 'CHEF', mustChangePassword: false },
    });
    const otherUser = await fixture.prisma.user.create({
      data: { tenantId: otherTenantId, email: `${otherTenantId}@test.local`, passwordHash: 'unused', fullName: 'Other', role: 'CHEF', mustChangePassword: false },
    });
    await fixture.app.listen(0, '127.0.0.1');
    const address = (fixture.app.getHttpServer() as HttpServer).address();
    if (!address || typeof address === 'string') throw new Error('HTTP server did not start');
    const url = `http://127.0.0.1:${address.port}`;
    ownSocket = io(url, { auth: { accessToken: accessToken(fixture.tenantId, ownUser.id) }, forceNew: true, transports: ['websocket'] });
    otherSocket = io(url, { auth: {}, forceNew: true, transports: ['websocket'] });
    await Promise.all([waitForConnect(ownSocket), waitForConnect(otherSocket)]);
    await joinTenantRoom(ownSocket, 'kitchen');
    await joinTenantRoom(otherSocket, 'kitchen', accessToken(otherTenantId, otherUser.id));

    const ownEvent = waitForEvent(ownSocket);
    const otherEvent = waitForNoEvent(otherSocket);
    fixture.app.get(MenuGateway).emitStopListChanged(fixture.tenantId, 'item-isolated', true);
    await expect(ownEvent).resolves.toEqual({ itemId: 'item-isolated', isInStopList: true });
    await expect(otherEvent).resolves.toBeUndefined();
  }, 30_000);
});

function accessToken(tenantId: string, userId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: userId, tenantId, userId, role: 'CHEF', sessionVersion: 0, type: 'access', jti: userId, exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
  const signature = createHmac('sha256', 'menu-cache-e2e-secret').update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function waitForConnect(socket: Socket): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
}

function joinTenantRoom(socket: Socket, room: 'kitchen', token?: string): Promise<void> {
  return new Promise((resolve, reject) => socket.emit('join_tenant_room', {
    room, ...(token ? { authorization: `Bearer ${token}` } : {}),
  }, (result: { ok: boolean }) => result.ok ? resolve() : reject(new Error('Staff could not join its tenant room'))));
}

function waitForEvent(socket: Socket): Promise<unknown> {
  return new Promise((resolve) => socket.once('menu:stop_list_changed', resolve));
}

function waitForNoEvent(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = () => { clearTimeout(timer); reject(new Error('Received another tenant event')); };
    const timer = setTimeout(() => { socket.off('menu:stop_list_changed', handler); resolve(); }, 500);
    socket.once('menu:stop_list_changed', handler);
  });
}

async function disconnectSocket(socket: Socket | undefined): Promise<void> {
  if (!socket) return;
  const engine = socket.io.engine;
  if (!engine || engine.readyState === 'closed') {
    socket.disconnect();
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 1_000);
    engine.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.disconnect();
    engine.close();
  });
}
