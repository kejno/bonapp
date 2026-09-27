import { createHmac } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { io, Socket } from 'socket.io-client';

jest.mock('../src/guest-session/guest-session.module', () => ({
  GuestSessionModule: class GuestSessionModule {},
}));

import { MenuGateway } from '../src/menu/menu.gateway';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-421: reject staff room join without a valid JWT', () => {
  const fixture = new MenuCacheTestFixture();
  let socket: Socket | undefined;

  beforeAll(async () => fixture.start({ redisAdapter: false }), 120_000);
  afterEach(async () => {
    await disconnectSocket(socket);
    socket = undefined;
  });
  afterAll(async () => fixture.stop());

  it('rejects missing, expired, and incorrectly signed JWTs without sending tenant events', async () => {
    await fixture.app.listen(0, '127.0.0.1');
    const address = (fixture.app.getHttpServer() as HttpServer).address();
    if (!address || typeof address === 'string')
      throw new Error('HTTP server did not start');
    socket = io(`http://127.0.0.1:${address.port}`, {
      forceNew: true,
      transports: ['websocket'],
    });
    await waitForConnect(socket);

    const invalidTokens: Array<string | undefined> = [
      undefined,
      staffToken(
        fixture.tenantId,
        'expired-user',
        Math.floor(Date.now() / 1000) - 60,
      ),
      `${staffToken(fixture.tenantId, 'tampered-user', Math.floor(Date.now() / 1000) + 300)}x`,
    ];

    for (const token of invalidTokens) {
      await expect(joinTenantRoom(socket, 'kitchen', token)).resolves.toEqual({
        ok: false,
      });
      const noEvent = waitForNoTenantEvent(socket);
      fixture.app
        .get(MenuGateway)
        .emitStopListChanged(fixture.tenantId, 'private-item', true);
      await expect(noEvent).resolves.toBeUndefined();
    }
  }, 30_000);
});

function waitForConnect(socket: Socket): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
}

function joinTenantRoom(
  socket: Socket,
  room: 'kitchen',
  token?: string,
): Promise<{ ok: boolean }> {
  return new Promise((resolve) =>
    socket.emit(
      'join_tenant_room',
      {
        room,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      resolve,
    ),
  );
}

function staffToken(tenantId: string, userId: string, exp: number): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      userId,
      tenantId,
      role: 'CHEF',
      type: 'access',
      jti: userId,
      sessionVersion: 0,
      exp,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', 'menu-cache-e2e-secret')
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function waitForNoTenantEvent(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = () => {
      clearTimeout(timer);
      reject(new Error('Received a tenant event without joining the room'));
    };
    const timer = setTimeout(() => {
      socket.off('menu:stop_list_changed', handler);
      resolve();
    }, 500);
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
