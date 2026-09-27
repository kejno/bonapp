import type { Server as HttpServer } from 'node:http';
import { io, Socket } from 'socket.io-client';

jest.mock('../src/guest-session/guest-session.module', () => ({
  GuestSessionModule: class GuestSessionModule {},
}));

import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-419: guest order room status event', () => {
  const fixture = new MenuCacheTestFixture();
  let socket: Socket | undefined;

  beforeAll(async () => fixture.start({ redisAdapter: false }), 120_000);
  afterEach(async () => { await disconnectSocket(socket); socket = undefined; });
  afterAll(async () => fixture.stop());

  it('joins the authorized order room and receives its status after PATCH', async () => {
    const table = await fixture.prisma.table.findFirstOrThrow({ where: { qrToken: fixture.qrToken } });
    await fixture.app.listen(0, '127.0.0.1');
    const address = (fixture.app.getHttpServer() as HttpServer).address();
    if (!address || typeof address === 'string') throw new Error('HTTP server did not start');
    const authorization = { Authorization: `Bearer ${fixture.token()}` };
    const created = await request(fixture.app.getHttpServer()).post('/api/v1/admin/orders')
      .set(authorization).send({ tableId: table.id, phone: '29 123 45 67' }).expect(201);
    const orderId = (created.body as { id: string }).id;
    socket = io(`http://127.0.0.1:${address.port}`, {
      auth: { qrToken: table.qrToken }, forceNew: true, transports: ['websocket'],
    });
    await waitForConnect(socket);
    await joinOrderRoom(socket, orderId);
    const event = waitForStatus(socket);

    await request(fixture.app.getHttpServer()).patch(`/api/v1/admin/orders/${orderId}/status`)
      .set(authorization).send({ status: 'COOKING' }).expect(200);

    await expect(event).resolves.toMatchObject({ orderId, status: 'COOKING' });
  }, 30_000);
});

function waitForConnect(socket: Socket): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
}

function joinOrderRoom(socket: Socket, orderId: string): Promise<void> {
  return new Promise((resolve, reject) => socket.emit('join_order_room', { orderId }, (result: { ok: boolean }) => {
    if (result.ok) resolve();
    else reject(new Error('Guest was not authorized for its order room'));
  }));
}

function waitForStatus(socket: Socket): Promise<{ orderId: string; status: string }> {
  return new Promise((resolve) => socket.once('order:status_changed', resolve));
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
