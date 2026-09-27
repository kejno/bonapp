import type { Server as HttpServer } from 'node:http';
import { io, Socket } from 'socket.io-client';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-421: reject staff room join without a valid JWT', () => {
  const fixture = new MenuCacheTestFixture();
  let socket: Socket | undefined;

  beforeAll(async () => fixture.start(), 120_000);
  afterEach(() => { socket?.disconnect(); socket = undefined; });
  afterAll(async () => fixture.stop());

  it('does not allow an unauthenticated socket to join a staff room', async () => {
    await fixture.app.listen(0, '127.0.0.1');
    const address = (fixture.app.getHttpServer() as HttpServer).address();
    if (!address || typeof address === 'string') throw new Error('HTTP server did not start');
    socket = io(`http://127.0.0.1:${address.port}`, { forceNew: true, transports: ['websocket'] });
    await waitForConnect(socket);

    await expect(joinTenantRoom(socket, 'kitchen')).resolves.toEqual({ ok: false });
  }, 30_000);
});

function waitForConnect(socket: Socket): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
}

function joinTenantRoom(socket: Socket, room: 'kitchen'): Promise<{ ok: boolean }> {
  return new Promise((resolve) => socket.emit('join_tenant_room', { room }, resolve));
}
