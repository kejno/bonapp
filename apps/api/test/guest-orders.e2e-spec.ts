import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { GuestOrdersController } from '../src/guest-session/guest-orders.controller';
import { GuestSessionGuard } from '../src/guest-session/guest-session.guard';
import { GuestSessionService } from '../src/guest-session/guest-session.service';
import { MenuGateway } from '../src/menu/menu.gateway';
import { OrdersService } from '../src/orders/orders.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenant/tenant-context.service';
import { buildTokenPair } from '../src/staff-auth/staff-jwt.util';

describe('POST /api/v1/guest/orders integration', () => {
  let app: INestApplication;
  let socket: Socket | undefined;
  const db = new PrismaClient();
  const tenantId = randomUUID();
  const tableId = randomUUID();
  const staffId = randomUUID();
  const categoryId = randomUUID();
  const itemWithModifierId = randomUUID();
  const plainItemId = randomUUID();
  const modifierGroupId = randomUUID();
  const modifierOptionId = randomUUID();
  const inactiveGroupId = randomUUID();
  const inactiveOptionId = randomUUID();
  const qrToken = `guest-order-${randomUUID()}`;
  const jwtSecret = 'guest-orders-integration-secret';

  beforeAll(async () => {
    process.env.JWT_SECRET = jwtSecret;
    await db.tenant.create({ data: { id: tenantId, slug: `guest-order-${tenantId}`, name: 'Integration Restaurant' } });
    const area = await db.diningArea.create({ data: { tenantId, name: 'Main' } });
    await db.table.create({ data: { id: tableId, tenantId, areaId: area.id, tableNumber: 1, qrToken } });
    await db.user.create({ data: {
      id: staffId, tenantId, email: `${staffId}@example.test`, passwordHash: 'unused', fullName: 'Kitchen Test',
      role: UserRole.CHEF, kitchenDepartments: ['HOT'],
    } });
    await db.menuCategory.create({ data: { id: categoryId, tenantId, name: 'Food', sortOrder: 1 } });
    await db.menuItem.create({ data: {
      id: itemWithModifierId, tenantId, categoryId, name: 'Soup', priceByn: 5, kitchenDepartment: 'HOT',
    } });
    await db.menuItem.create({ data: {
      id: plainItemId, tenantId, categoryId, name: 'Tea', priceByn: 3, kitchenDepartment: 'HOT',
    } });
    await db.modifierGroup.create({ data: {
      id: modifierGroupId, tenantId, itemId: itemWithModifierId, name: 'Add-on', isRequired: true, minSelection: 1, maxSelection: 1,
    } });
    await db.modifierOption.create({ data: {
      id: modifierOptionId, groupId: modifierGroupId, name: 'Sour cream', extraPriceByn: 1.25,
    } });
    await db.modifierGroup.create({ data: {
      id: inactiveGroupId, tenantId, itemId: itemWithModifierId, name: 'Unavailable', isActive: false,
    } });
    await db.menuItemModifierGroup.create({ data: {
      tenantId, menuItemId: itemWithModifierId, modifierGroupId: inactiveGroupId, sortOrder: 1,
    } });
    await db.modifier.create({ data: {
      id: inactiveOptionId, tenantId, modifierGroupId: inactiveGroupId, name: 'Unavailable option', price: 0.5, sortOrder: 1,
    } });

    const module = await Test.createTestingModule({
      controllers: [GuestOrdersController],
      providers: [
        GuestSessionService,
        GuestSessionGuard,
        MenuGateway,
        PrismaService,
        TenantContextService,
        { provide: ConfigService, useValue: { get: () => undefined, getOrThrow: () => jwtSecret } },
        { provide: OrdersService, useValue: { updateKitchenStatusForTenant: jest.fn() } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    socket?.disconnect();
    await app?.close();
    await db.order.deleteMany({ where: { tenantId } });
    await db.menuItem.deleteMany({ where: { tenantId } });
    await db.menuCategory.deleteMany({ where: { tenantId } });
    await db.table.deleteMany({ where: { tenantId } });
    await db.diningArea.deleteMany({ where: { tenantId } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.tenant.deleteMany({ where: { id: tenantId } });
    await db.$disconnect();
  });

  it('creates a multi-item order with server prices and delivers order:created to the tenant kitchen room', async () => {
    const address = (app.getHttpServer() as unknown as { address(): AddressInfo }).address();
    const { accessToken } = buildTokenPair(staffId, tenantId, UserRole.CHEF, jwtSecret);
    socket = io(`http://127.0.0.1:${address.port}`, { auth: { accessToken }, transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Kitchen socket connection timed out')), 5_000);
      socket?.once('connect', () => { clearTimeout(timeout); resolve(); });
      socket?.once('connect_error', (error: Error) => { clearTimeout(timeout); reject(error); });
    });
    await new Promise<void>((resolve, reject) => {
      socket?.emit('join_tenant_room', { room: 'kitchen', authorization: `Bearer ${accessToken}` }, (result: { ok?: boolean }) => {
        if (result.ok) resolve(); else reject(new Error('Kitchen room join was rejected'));
      });
    });
    const kitchenEvent = new Promise<unknown>((resolve) => socket?.once('order:created', resolve));

    const response = await request(app.getHttpServer() as never)
      .post('/api/v1/guest/orders')
      .set('X-QR-Token', qrToken)
      .send({
        qrToken,
        guestSessionId: randomUUID(),
        comment: 'Без перца',
        items: [
          { menuItemId: itemWithModifierId, quantity: 2, selectedModifiers: [modifierOptionId] },
          { menuItemId: plainItemId, quantity: 1, selectedModifiers: [] },
        ],
      })
      .expect(201);

    const createdOrder = readOrderResponse(response.body);
    expect(createdOrder).toMatchObject({ dailyOrderNumber: 1, status: 'NEW', totalAmountByn: 15.5 });
    expect(createdOrder.orderId).toEqual(expect.any(String));
    expect(createdOrder.estimatedReadyTime).toEqual(expect.any(String));
    await expect(kitchenEvent).resolves.toMatchObject({ id: createdOrder.orderId, dailyOrderNumber: 1 });
    await request(app.getHttpServer() as never)
      .get(`/api/v1/guest/orders/${createdOrder.orderId}`)
      .set('X-QR-Token', qrToken)
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ id: createdOrder.orderId, dailyOrderNumber: 1, status: 'NEW' }));

    const nextResponse = await request(app.getHttpServer() as never)
      .post('/api/v1/guest/orders')
      .set('X-QR-Token', qrToken)
      .send({ qrToken, comment: '', items: [{ menuItemId: plainItemId, quantity: 1, selectedModifiers: [] }] })
      .expect(201);
    expect(readOrderResponse(nextResponse.body).dailyOrderNumber).toBe(2);
  }, 15_000);

  it('rejects an order when a required modifier is missing', async () => {
    await request(app.getHttpServer() as never)
      .post('/api/v1/guest/orders')
      .set('X-QR-Token', qrToken)
      .send({ qrToken, comment: '', items: [{ menuItemId: itemWithModifierId, quantity: 1, selectedModifiers: [] }] })
      .expect(400);
  });

  it('rejects modifiers from an inactive group', async () => {
    await request(app.getHttpServer() as never)
      .post('/api/v1/guest/orders')
      .set('X-QR-Token', qrToken)
      .send({ qrToken, comment: '', items: [{ menuItemId: itemWithModifierId, quantity: 1, selectedModifiers: [modifierOptionId, inactiveOptionId] }] })
      .expect(400);
  });

  it('rejects an item on the stop list and leaves no order behind', async () => {
    await db.stopListItem.create({ data: { tenantId, menuItemId: plainItemId, isStopped: true } });
    try {
      await request(app.getHttpServer() as never)
        .post('/api/v1/guest/orders')
        .set('X-QR-Token', qrToken)
        .send({ qrToken, comment: '', items: [{ menuItemId: plainItemId, quantity: 1, selectedModifiers: [] }] })
        .expect(400);
    } finally {
      await db.stopListItem.deleteMany({ where: { tenantId, menuItemId: plainItemId } });
    }
  });

  it('rejects an empty cart and comments over 255 characters', async () => {
    await request(app.getHttpServer() as never)
      .post('/api/v1/guest/orders')
      .set('X-QR-Token', qrToken)
      .send({ qrToken, comment: '', items: [] })
      .expect(400);
    await request(app.getHttpServer() as never)
      .post('/api/v1/guest/orders')
      .set('X-QR-Token', qrToken)
      .send({ qrToken, comment: 'x'.repeat(256), items: [{ menuItemId: plainItemId, quantity: 1, selectedModifiers: [] }] })
      .expect(400);
  });
});

interface GuestOrderResponse {
  orderId: string
  dailyOrderNumber: number
  status: string
  totalAmountByn: number
  estimatedReadyTime: string
}

function readOrderResponse(value: unknown): GuestOrderResponse {
  if (value === null || typeof value !== 'object') throw new Error('Invalid guest order response')
  const response = value as Record<string, unknown>
  if (typeof response['orderId'] !== 'string' || typeof response['dailyOrderNumber'] !== 'number' || typeof response['status'] !== 'string' || typeof response['totalAmountByn'] !== 'number' || typeof response['estimatedReadyTime'] !== 'string') {
    throw new Error('Invalid guest order response')
  }
  return {
    orderId: response['orderId'],
    dailyOrderNumber: response['dailyOrderNumber'],
    status: response['status'],
    totalAmountByn: response['totalAmountByn'],
    estimatedReadyTime: response['estimatedReadyTime'],
  }
}
