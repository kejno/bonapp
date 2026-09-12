process.env.JWT_SECRET = 'test-e2e-secret';
process.env.DB_PASSWORD = 'postgres';
process.env.NODE_ENV = 'test';
process.env.APP_URL = 'http://localhost:5173';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';

describe('BNP-12: Order — создание заказа гостем, управление статусами персоналом', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let ownerToken: string;
  let tenantId: string;
  let tableId: string;
  let menuItemId: string;
  let menuItemPrice: number;
  let categoryId: string;

  const ownerEmail = 'owner-bnp12@test.com';
  const password = 'password123';
  const venueName = 'BNP12 Restaurant';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleFixture.get(DataSource);

    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: venueName, email: ownerEmail, password });

    ownerToken = registerRes.body.accessToken as string;
    const [, payloadB64] = ownerToken.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
      sub: string;
      tenantId: string;
    };
    tenantId = payload.tenantId;

    const tableRes = await request(app.getHttpServer())
      .post('/tables')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Test Table BNP12' });
    tableId = tableRes.body.id as string;

    const catRes = await request(app.getHttpServer())
      .post('/menu/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Food', sortOrder: 1 });
    categoryId = catRes.body.id as string;

    menuItemPrice = 9.99;
    const itemRes = await request(app.getHttpServer())
      .post('/menu/items')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ categoryId, name: 'Burger', price: menuItemPrice, isAvailable: true });
    menuItemId = itemRes.body.id as string;
  });

  afterAll(async () => {
    await dataSource.query(
      `DELETE FROM orders WHERE "tenantId" = $1`,
      [tenantId],
    );
    await dataSource.query(`DELETE FROM menu_items WHERE "tenantId" = $1`, [tenantId]);
    await dataSource.query(`DELETE FROM menu_categories WHERE "tenantId" = $1`, [tenantId]);
    await dataSource.query(`DELETE FROM tables WHERE "tenantId" = $1`, [tenantId]);
    await dataSource.query(`DELETE FROM users WHERE email LIKE '%bnp12%'`);
    await dataSource.query(`DELETE FROM tenants WHERE slug LIKE '%bnp12%'`);
    await app.close();
  });

  describe('POST /public/orders — создание заказа гостем', () => {
    it('creates an order and returns orderId and status NEW', async () => {
      const res = await request(app.getHttpServer())
        .post('/public/orders')
        .send({ tenantId, tableId, items: [{ menuItemId, quantity: 2 }] });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('orderId');
      expect(res.body.status).toBe('NEW');
    });

    it('calculates totalAmount from DB price, not client value', async () => {
      const res = await request(app.getHttpServer())
        .post('/public/orders')
        .send({ tenantId, tableId, items: [{ menuItemId, quantity: 3 }] });

      expect(res.status).toBe(201);

      const [order] = await dataSource.query(
        `SELECT "totalAmount" FROM orders WHERE id = $1`,
        [res.body.orderId],
      );
      expect(parseFloat(order.totalAmount)).toBeCloseTo(menuItemPrice * 3, 2);
    });

    it('creates items JSONB snapshot with name and price from DB', async () => {
      const res = await request(app.getHttpServer())
        .post('/public/orders')
        .send({ tenantId, tableId, items: [{ menuItemId, quantity: 1 }] });

      expect(res.status).toBe(201);

      const [order] = await dataSource.query(
        `SELECT items FROM orders WHERE id = $1`,
        [res.body.orderId],
      );
      const items = order.items as Array<{ menuItemId: string; name: string; price: number; quantity: number }>;
      expect(items).toHaveLength(1);
      expect(items[0].menuItemId).toBe(menuItemId);
      expect(items[0].name).toBe('Burger');
      expect(items[0].price).toBeCloseTo(menuItemPrice, 2);
      expect(items[0].quantity).toBe(1);
    });

    it('creates order with multiple distinct items', async () => {
      const item2Res = await request(app.getHttpServer())
        .post('/menu/items')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ categoryId, name: 'Fries', price: 3.5, isAvailable: true });
      const item2Id = item2Res.body.id as string;

      const res = await request(app.getHttpServer())
        .post('/public/orders')
        .send({
          tenantId,
          tableId,
          items: [
            { menuItemId, quantity: 1 },
            { menuItemId: item2Id, quantity: 2 },
          ],
        });

      expect(res.status).toBe(201);

      const [order] = await dataSource.query(
        `SELECT items, "totalAmount" FROM orders WHERE id = $1`,
        [res.body.orderId],
      );
      const items = order.items as Array<{ price: number; quantity: number }>;
      expect(items).toHaveLength(2);
      const expected = menuItemPrice * 1 + 3.5 * 2;
      expect(parseFloat(order.totalAmount)).toBeCloseTo(expected, 2);
    });

    it('returns 404 when tableId does not belong to the given tenantId', async () => {
      const otherRegRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'BNP12 Other', email: 'other2-bnp12@test.com', password });
      const otherTableRes = await request(app.getHttpServer())
        .post('/tables')
        .set('Authorization', `Bearer ${otherRegRes.body.accessToken}`)
        .send({ name: 'Other Table' });
      const otherTableId = otherTableRes.body.id as string;

      const res = await request(app.getHttpServer())
        .post('/public/orders')
        .send({ tenantId, tableId: otherTableId, items: [{ menuItemId, quantity: 1 }] });

      expect(res.status).toBe(404);
    });

    it('returns 404 for non-existent menuItemId', async () => {
      const res = await request(app.getHttpServer())
        .post('/public/orders')
        .send({
          tenantId,
          tableId,
          items: [{ menuItemId: '00000000-0000-0000-0000-000000000000', quantity: 1 }],
        });

      expect(res.status).toBe(404);
    });

    it('returns 422 when a menu item is unavailable', async () => {
      const unavailRes = await request(app.getHttpServer())
        .post('/menu/items')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ categoryId, name: 'Sold Out Item', price: 5.0, isAvailable: false });
      const unavailId = unavailRes.body.id as string;

      const res = await request(app.getHttpServer())
        .post('/public/orders')
        .send({ tenantId, tableId, items: [{ menuItemId: unavailId, quantity: 1 }] });

      expect(res.status).toBe(422);
    });

    it('returns 400 for missing required fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/public/orders')
        .send({ tenantId, tableId });

      expect(res.status).toBe(400);
    });

    it('returns 400 for empty items array', async () => {
      const res = await request(app.getHttpServer())
        .post('/public/orders')
        .send({ tenantId, tableId, items: [] });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /orders — список заказов (персонал)', () => {
    let order1Id: string;
    let order2Id: string;

    beforeAll(async () => {
      const r1 = await request(app.getHttpServer())
        .post('/public/orders')
        .send({ tenantId, tableId, items: [{ menuItemId, quantity: 1 }] });
      order1Id = r1.body.orderId as string;

      const r2 = await request(app.getHttpServer())
        .post('/public/orders')
        .send({ tenantId, tableId, items: [{ menuItemId, quantity: 2 }] });
      order2Id = r2.body.orderId as string;
    });

    it('returns paginated list of orders for the tenant', async () => {
      const res = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('limit');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('returns only orders belonging to the current tenant', async () => {
      const res = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      const ids = (res.body.data as Array<{ id: string }>).map((o) => o.id);
      expect(ids).toContain(order1Id);
      expect(ids).toContain(order2Id);
      const tenantIds = (res.body.data as Array<{ tenantId: string }>).map((o) => o.tenantId);
      expect(tenantIds.every((tid) => tid === tenantId)).toBe(true);
    });

    it('filters by status=NEW', async () => {
      const res = await request(app.getHttpServer())
        .get('/orders?status=NEW')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      const statuses = (res.body.data as Array<{ status: string }>).map((o) => o.status);
      expect(statuses.every((s) => s === 'NEW')).toBe(true);
    });

    it('filters by tableId', async () => {
      const res = await request(app.getHttpServer())
        .get(`/orders?tableId=${tableId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      const tableIds = (res.body.data as Array<{ tableId: string }>).map((o) => o.tableId);
      expect(tableIds.every((tid) => tid === tableId)).toBe(true);
    });

    it('respects page and limit pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/orders?page=1&limit=1')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(1);
      expect(res.body.total).toBeGreaterThan(1);
    });

    it('returns 401 without token', async () => {
      const res = await request(app.getHttpServer()).get('/orders');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /orders/:id — детали заказа', () => {
    let orderId: string;

    beforeAll(async () => {
      const r = await request(app.getHttpServer())
        .post('/public/orders')
        .send({ tenantId, tableId, items: [{ menuItemId, quantity: 1 }] });
      orderId = r.body.orderId as string;
    });

    it('returns order details for valid id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(orderId);
      expect(res.body.tenantId).toBe(tenantId);
      expect(res.body.tableId).toBe(tableId);
      expect(res.body.status).toBe('NEW');
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body).toHaveProperty('totalAmount');
    });

    it('returns 404 for non-existent order id', async () => {
      const res = await request(app.getHttpServer())
        .get('/orders/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 401 without token', async () => {
      const res = await request(app.getHttpServer()).get(`/orders/${orderId}`);
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /orders/:id/status — смена статуса', () => {
    let orderId: string;

    beforeEach(async () => {
      const r = await request(app.getHttpServer())
        .post('/public/orders')
        .send({ tenantId, tableId, items: [{ menuItemId, quantity: 1 }] });
      orderId = r.body.orderId as string;
    });

    it('transitions NEW → IN_PROGRESS', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('IN_PROGRESS');
    });

    it('transitions NEW → CANCELLED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'CANCELLED' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
    });

    it('transitions IN_PROGRESS → DONE', async () => {
      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'IN_PROGRESS' });

      const res = await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'DONE' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('DONE');
    });

    it('transitions IN_PROGRESS → CANCELLED', async () => {
      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'IN_PROGRESS' });

      const res = await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'CANCELLED' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
    });

    it('returns 400 for invalid transition NEW → DONE', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'DONE' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid transition DONE → anything', async () => {
      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'IN_PROGRESS' });
      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'DONE' });

      const res = await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'CANCELLED' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid status value', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'INVALID_STATUS' });

      expect(res.status).toBe(400);
    });

    it('returns 401 without token', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(401);
    });
  });

  describe('Tenant isolation — персонал не видит заказы чужого тенанта', () => {
    let otherToken: string;
    let myOrderId: string;

    beforeAll(async () => {
      const otherRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'BNP12 Isolated Restaurant', email: 'isolated-bnp12@test.com', password });
      otherToken = otherRes.body.accessToken as string;

      const r = await request(app.getHttpServer())
        .post('/public/orders')
        .send({ tenantId, tableId, items: [{ menuItemId, quantity: 1 }] });
      myOrderId = r.body.orderId as string;
    });

    it('GET /orders returns only own tenant orders', async () => {
      const res = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(200);
      const ids = (res.body.data as Array<{ id: string }>).map((o) => o.id);
      expect(ids).not.toContain(myOrderId);
    });

    it('GET /orders/:id returns 404 for another tenant order', async () => {
      const res = await request(app.getHttpServer())
        .get(`/orders/${myOrderId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(404);
    });

    it('PATCH /orders/:id/status returns 404 for another tenant order', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/orders/${myOrderId}/status`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(404);
    });
  });
});
