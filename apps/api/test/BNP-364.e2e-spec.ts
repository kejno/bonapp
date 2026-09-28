import { createHmac } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-364: update item stop-list state', () => {
  const fixture = new MenuCacheTestFixture();
  let hallSocket: Socket | undefined;

  beforeAll(async () => {
    await fixture.start();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  afterEach(() => {
    hallSocket?.disconnect();
    hallSocket = undefined;
  });

  it('updates the database and guest menu and emits the tenant event', async () => {
    const authorization = { Authorization: `Bearer ${fixture.token()}` };

    const staff = await fixture.prisma.user.create({
      data: {
        tenantId: fixture.tenantId,
        email: `hall-${fixture.tenantId}@test.local`,
        passwordHash: 'unused',
        fullName: 'Hall staff',
        role: 'OWNER',
        mustChangePassword: false,
      },
    });
    await fixture.app.listen(0, '127.0.0.1');
    const address = (fixture.app.getHttpServer() as HttpServer).address();
    if (!address || typeof address === 'string') throw new Error('HTTP server did not start');
    hallSocket = io(`http://127.0.0.1:${address.port}`, {
      auth: { accessToken: accessToken(fixture.tenantId, staff.id) },
      forceNew: true,
      transports: ['websocket'],
    });
    await waitForConnect(hallSocket);
    await joinTenantRoom(hallSocket, 'hall');

    const stopListEvent = waitForStopListChanged(hallSocket);
    await request(fixture.app.getHttpServer())
      .get('/api/v1/guest/menu').set('X-QR-Token', fixture.qrToken)
      .set(authorization)
      .expect(200);
    expect(await fixture.redis.get(fixture.cacheKey)).not.toBeNull();

    await request(fixture.app.getHttpServer())
      .patch(`/api/v1/admin/menu/items/${fixture.itemId}/stop-list`)
      .set(authorization)
      .send({ is_in_stop_list: true })
      .expect(200);
    expect(await fixture.redis.get(fixture.cacheKey)).toBeNull();

    await expect(
      fixture.prisma.menuItem.findUnique({
        where: { tenantId_id: { tenantId: fixture.tenantId, id: fixture.itemId } },
        select: { isInStopList: true },
      }),
    ).resolves.toEqual({ isInStopList: true });

    const guestMenu = await request(fixture.app.getHttpServer())
      .get('/api/v1/guest/menu').set('X-QR-Token', fixture.qrToken)
      .set(authorization)
      .expect(200);
    expect(hasStopListedItem(guestMenu.body, fixture.itemId)).toBe(true);
    await expect(stopListEvent).resolves.toEqual({ itemId: fixture.itemId, isInStopList: true });
  });
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

function joinTenantRoom(socket: Socket, room: 'hall'): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.emit('join_tenant_room', { room }, (result: { ok: boolean }) => {
      if (result.ok) resolve();
      else reject(new Error(`Staff client could not join the ${room} room`));
    });
  });
}

function waitForStopListChanged(
  socket: Socket,
): Promise<{ itemId: string; isInStopList: boolean }> {
  return new Promise((resolve) => {
    socket.once('menu:stop_list_changed', resolve);
  });
}

function hasStopListedItem(menu: unknown, itemId: string): boolean {
  if (!Array.isArray(menu)) return false;
  const categories: unknown[] = menu;
  return categories.some((category: unknown) => {
    if (!isRecord(category) || !Array.isArray(category.items)) return false;
    const items: unknown[] = category.items;
    return items.some(
      (item: unknown) =>
        isRecord(item) && item.id === itemId && item.isInStopList === true,
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
