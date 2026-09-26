import { createHmac } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-154: administrator orders and status delivery', () => {
  const fixture = new MenuCacheTestFixture();
  let guestSocket: Socket | undefined;
  let otherGuestSocket: Socket | undefined;
  let kitchenSocket: Socket | undefined;

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterEach(() => {
    guestSocket?.disconnect();
    otherGuestSocket?.disconnect();
    kitchenSocket?.disconnect();
    guestSocket = undefined;
    otherGuestSocket = undefined;
    kitchenSocket = undefined;
  });

  afterAll(async () => {
    await fixture.stop();
  });

  it('creates an order, aggregates KDS items, and delivers its status to connected guest and kitchen clients', async () => {
    const area = await fixture.prisma.diningArea.create({
      data: { tenantId: fixture.tenantId, name: 'Main' },
    });
    const table = await fixture.prisma.table.create({
      data: {
        tenantId: fixture.tenantId,
        areaId: area.id,
        tableNumber: 1,
        qrToken: `qr-${fixture.tenantId}`,
      },
    });
    const otherTable = await fixture.prisma.table.create({
      data: {
        tenantId: fixture.tenantId,
        areaId: area.id,
        tableNumber: 2,
        qrToken: `qr-other-${fixture.tenantId}`,
      },
    });
    const kitchenUser = await fixture.prisma.user.create({
      data: {
        tenantId: fixture.tenantId,
        email: `kitchen-${fixture.tenantId}@test.local`,
        passwordHash: 'unused',
        fullName: 'Kitchen',
        role: 'OWNER',
        mustChangePassword: false,
      },
    });

    await fixture.app.listen(0, '127.0.0.1');
    const address = (fixture.app.getHttpServer() as HttpServer).address();
    if (!address || typeof address === 'string') throw new Error('HTTP server did not start');
    const serverUrl = `http://127.0.0.1:${address.port}`;
    kitchenSocket = io(serverUrl, {
      auth: { accessToken: accessToken(fixture.tenantId, kitchenUser.id) },
      forceNew: true,
      transports: ['websocket'],
    });
    await waitForConnect(kitchenSocket);
    await joinTenantRoom(kitchenSocket, 'kitchen');

    const guestSession = await request(fixture.app.getHttpServer())
      .get(`/api/v1/guest/session/${table.qrToken}`)
      .expect(200);
    const otherGuestSession = await request(fixture.app.getHttpServer())
      .get(`/api/v1/guest/session/${otherTable.qrToken}`)
      .expect(200);
    const guestToken = (guestSession.body as { tableSessionToken: string }).tableSessionToken;
    const otherGuestToken = (otherGuestSession.body as { tableSessionToken: string }).tableSessionToken;

    const created = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ tableId: table.id, phone: '29 123 45 67' })
      .expect(201);
    const orderId = (created.body as { id: string }).id;
    const otherCreated = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ tableId: otherTable.id, phone: '29 765 43 21' })
      .expect(201);
    const otherOrderId = (otherCreated.body as { id: string }).id;

    guestSocket = io(serverUrl, {
      auth: { tableSessionToken: guestToken },
      forceNew: true,
      transports: ['websocket'],
    });
    otherGuestSocket = io(serverUrl, {
      auth: { tableSessionToken: otherGuestToken },
      forceNew: true,
      transports: ['websocket'],
    });
    await Promise.all([waitForConnect(guestSocket), waitForConnect(otherGuestSocket)]);
    await Promise.all([
      joinOrderRoom(guestSocket, orderId),
      joinOrderRoom(otherGuestSocket, otherOrderId),
    ]);

    await fixture.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${fixture.tenantId}, true)`;
      await tx.orderItem.createMany({
        data: [
          { orderId, itemId: fixture.itemId, quantity: 2, unitPriceByn: 3.5, selectedModifiers: [], status: 'NEW', kitchenDepartment: 'HOT' },
          { orderId, itemId: fixture.itemId, quantity: 3, unitPriceByn: 3.5, selectedModifiers: [], status: 'NEW', kitchenDepartment: 'HOT' },
          { orderId, itemId: fixture.itemId, quantity: 1, unitPriceByn: 3.5, selectedModifiers: [], status: 'NEW', kitchenDepartment: 'COLD' },
        ],
      });
    });

    const active = await request(fixture.app.getHttpServer())
      .get('/api/v1/admin/orders/active')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .expect(200);
    const order = (active.body as Array<{ id: string; items: Array<Record<string, unknown>> }>).find(
      (candidate) => candidate.id === orderId,
    );
    expect(order?.items).toEqual([
      { itemId: fixture.itemId, name: 'Espresso', quantity: 5, kitchenDepartment: 'HOT' },
      { itemId: fixture.itemId, name: 'Espresso', quantity: 1, kitchenDepartment: 'COLD' },
    ]);

    const guestEvent = waitForStatus(guestSocket);
    const otherGuestEvent = waitForNoStatus(otherGuestSocket);
    const kitchenEvent = waitForStatus(kitchenSocket);
    await request(fixture.app.getHttpServer())
      .patch(`/api/v1/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ status: 'COOKING' })
      .expect(200);
    await expect(Promise.all([guestEvent, kitchenEvent])).resolves.toEqual([
      { orderId, status: 'COOKING' },
      { orderId, status: 'COOKING' },
    ]);
    await expect(otherGuestEvent).resolves.toBeUndefined();
  }, 30_000);
});

function accessToken(tenantId: string, userId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    tenantId,
    userId,
    role: 'OWNER',
    sessionVersion: 0,
    type: 'access',
    jti: `test-${userId}`,
    exp: Math.floor(Date.now() / 1000) + 300,
  })).toString('base64url');
  const signature = createHmac('sha256', 'menu-cache-e2e-secret')
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function waitForConnect(socket: Socket): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
}

function waitForStatus(socket: Socket): Promise<{ orderId: string; status: string }> {
  return new Promise((resolve) => {
    socket.once('order:status_changed', resolve);
  });
}

function joinOrderRoom(socket: Socket, orderId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.emit('join_order_room', { orderId }, (result: { ok: boolean }) => {
      if (result.ok) resolve();
      else reject(new Error('Guest was not authorized for its order room'));
    });
  });
}

function joinTenantRoom(socket: Socket, room: 'kitchen' | 'hall'): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.emit('join_tenant_room', { room }, (result: { ok: boolean }) => {
      if (result.ok) resolve();
      else reject(new Error(`Staff client could not join the ${room} room`));
    });
  });
}

function waitForNoStatus(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const onStatus = () => {
      clearTimeout(timer);
      reject(new Error('Guest from another table received the order status'));
    };
    const timer = setTimeout(() => {
      socket.off('order:status_changed', onStatus);
      resolve();
    }, 250);
    socket.once('order:status_changed', onStatus);
  });
}
