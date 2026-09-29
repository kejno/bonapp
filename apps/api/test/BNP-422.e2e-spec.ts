import { createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server as HttpServer } from 'node:http';
import type { Socket as NetSocket } from 'node:net';
import { io, Socket } from 'socket.io-client';

jest.mock('../src/guest-session/guest-session.module', () => ({
  GuestSessionModule: class GuestSessionModule {},
}));

import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MenuGateway } from '../src/menu/menu.gateway';
import { OnboardingService } from '../src/onboarding/onboarding.service';
import { TableQrPdfService } from '../src/halls/table-qr-pdf.service';
import {
  MenuCacheTestFixture,
  prepareGatewayShutdown,
} from './menu-cache-test.fixture';
import { ShiftService } from '../src/staff/shift.service';

describe('BNP-422: Redis adapter order status delivery', () => {
  const fixture = new MenuCacheTestFixture();
  let secondApp: INestApplication | undefined;
  let subscriber: Socket | undefined;
  let handler: Socket | undefined;
  const serverConnections = new Set<NetSocket>();

  beforeAll(async () => fixture.start({ redisAdapter: true }), 120_000);
  afterEach(async () => {
    await Promise.all([
      disconnectSocket(subscriber),
      disconnectSocket(handler),
    ]);
    subscriber = undefined;
    handler = undefined;
  });
  afterAll(async () => {
    if (secondApp) await prepareGatewayShutdown(secondApp.get(MenuGateway));
    for (const connection of serverConnections) connection.destroy();
    await secondApp?.close();
    await fixture.stop();
  });

  it('updates an order on the second Gateway and delivers exactly one status event to the first', async () => {
    const table = await fixture.prisma.table.findFirstOrThrow({
      where: { qrToken: fixture.qrToken },
    });
    const chef = await fixture.prisma.user.create({
      data: {
        tenantId: fixture.tenantId,
        email: `${fixture.tenantId}@redis-test.local`,
        passwordHash: 'unused',
        fullName: 'Redis chef',
        role: 'CHEF',
        kitchenDepartments: ['HOT'],
        mustChangePassword: false,
      },
    });
    await fixture.app.listen(0, '127.0.0.1');
    const primaryAddress = (
      fixture.app.getHttpServer() as HttpServer
    ).address();
    if (!primaryAddress || typeof primaryAddress === 'string')
      throw new Error('Primary HTTP server did not start');

    const created = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${fixture.token()}`)
      .send({ tableId: table.id, phone: '29 123 45 67' })
      .expect(201);
    const orderId = (created.body as { id: string }).id;
    await fixture.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${fixture.tenantId}, true)`;
      await tx.orderItem.create({
        data: {
          orderId,
          itemId: fixture.itemId,
          quantity: 1,
          unitPriceByn: 3.5,
          selectedModifiers: [],
          status: 'NEW',
          kitchenDepartment: 'HOT',
        },
      });
    });

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ShiftService)
      .useValue({})
      .overrideProvider(OnboardingService)
      .useValue({})
      .overrideProvider(TableQrPdfService)
      .useValue({})
      .compile();
    secondApp = module.createNestApplication();
    secondApp.setGlobalPrefix('api/v1');
    const secondHttpServer = secondApp.getHttpServer() as HttpServer;
    secondHttpServer.on('connection', (connection: NetSocket) => {
      serverConnections.add(connection);
      connection.once('close', () => serverConnections.delete(connection));
    });
    await secondApp.init();
    await secondApp.listen(0, '127.0.0.1');
    const secondAddress = secondHttpServer.address();
    if (!secondAddress || typeof secondAddress === 'string')
      throw new Error('Second HTTP server did not start');

    const secondGateway = secondApp.get(MenuGateway);
    const emitOrderStatusChanged = secondGateway.emitOrderStatusChanged.bind(secondGateway);
    let publishCount = 0;
    let resolvePublished: () => void = () => {};
    const published = new Promise<void>((resolve) => {
      resolvePublished = resolve;
    });
    jest.spyOn(secondGateway, 'emitOrderStatusChanged').mockImplementation((...args) => {
      if (args[1] === orderId) {
        publishCount += 1;
        resolvePublished();
      }
      emitOrderStatusChanged(...args);
    });

    subscriber = io(`http://127.0.0.1:${primaryAddress.port}`, {
      auth: { accessToken: staffToken(fixture.tenantId, chef.id) },
      forceNew: true,
      transports: ['websocket'],
    });
    handler = io(`http://127.0.0.1:${secondAddress.port}`, {
      auth: { accessToken: staffToken(fixture.tenantId, chef.id) },
      forceNew: true,
      transports: ['websocket'],
    });
    await Promise.all([waitForConnect(subscriber), waitForConnect(handler)]);
    await Promise.all([
      joinTenantRoom(subscriber, fixture.tenantId, chef.id),
      joinTenantRoom(handler, fixture.tenantId, chef.id),
    ]);

    const received = collectStatusEvents(subscriber, orderId);
    handler.emit('order:update_status', { orderId, department: 'HOT' });
    await waitForProcessingAndDelivery(received, published);

    expect(
      await fixture.prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
    ).toMatchObject({ status: 'COOKING' });
    expect(received.events).toHaveLength(1);
    expect(received.events[0]).toMatchObject({ orderId, status: 'COOKING' });
    expect(publishCount).toBe(1);
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
  tenantId: string,
  userId: string,
): Promise<void> {
  return new Promise((resolve, reject) =>
    socket.emit(
      'join_tenant_room',
      {
        room: 'kitchen',
        authorization: `Bearer ${staffToken(tenantId, userId)}`,
      },
      (result: { ok: boolean }) =>
        result.ok
          ? resolve()
          : reject(new Error('Staff could not join the kitchen room')),
    ),
  );
}

function staffToken(tenantId: string, userId: string): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      userId,
      tenantId,
      role: 'CHEF',
      sessionVersion: 0,
      type: 'access',
      jti: userId,
      exp: Math.floor(Date.now() / 1000) + 300,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', 'menu-cache-e2e-secret')
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function collectStatusEvents(
  socket: Socket,
  orderId: string,
): { events: unknown[]; received: Promise<void> } {
  const events: unknown[] = [];
  let resolveReceived: () => void = () => {};
  const received = new Promise<void>((resolve) => {
    resolveReceived = resolve;
  });
  socket.on('order:status_changed', (event: { orderId?: string }) => {
    if (event.orderId !== orderId) return;
    events.push(event);
    resolveReceived();
  });
  return { events, received };
}

async function waitForProcessingAndDelivery(
  result: { received: Promise<void> },
  published: Promise<void>,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      Promise.all([result.received, published]),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Timed out waiting for order status processing and Redis delivery')),
          5_000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
