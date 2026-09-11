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

describe('BNP-11: Table/QR — управление столами и генерация QR-кодов', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let ownerToken: string;
  let tenantId: string;
  let tenantSlug: string;

  const ownerEmail = 'owner-bnp11@test.com';
  const password = 'password123';
  const venueName = 'BNP11 Restaurant';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleFixture.get(DataSource);

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: venueName, email: ownerEmail, password });

    ownerToken = res.body.accessToken as string;
    const [, payloadB64] = ownerToken.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
      sub: string;
      tenantId: string;
    };
    tenantId = payload.tenantId;

    const [tenant] = await dataSource.query(
      `SELECT slug FROM tenants WHERE id = $1`,
      [tenantId],
    );
    tenantSlug = tenant.slug as string;
  });

  afterAll(async () => {
    await dataSource.query(
      `DELETE FROM orders WHERE "tableId" IN (SELECT id FROM tables WHERE "tenantId" = $1)`,
      [tenantId],
    );
    await dataSource.query(`DELETE FROM tables WHERE "tenantId" = $1`, [tenantId]);
    await dataSource.query(`DELETE FROM users WHERE email LIKE '%bnp11%'`);
    await dataSource.query(`DELETE FROM tenants WHERE slug LIKE '%bnp11%'`);
    await app.close();
  });

  describe('POST /tables — создание стола', () => {
    it('creates a table and returns 201 with table data', async () => {
      const res = await request(app.getHttpServer())
        .post('/tables')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Table 1' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Table 1');
      expect(res.body.tenantId).toBe(tenantId);
      expect(res.body.description).toBeNull();
    });

    it('creates a table with description', async () => {
      const res = await request(app.getHttpServer())
        .post('/tables')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Table 2', description: 'Window seat' });

      expect(res.status).toBe(201);
      expect(res.body.description).toBe('Window seat');
    });

    it('returns 401 without token', async () => {
      const res = await request(app.getHttpServer())
        .post('/tables')
        .send({ name: 'Unauthorized Table' });

      expect(res.status).toBe(401);
    });

    it('returns 400 for missing name', async () => {
      const res = await request(app.getHttpServer())
        .post('/tables')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /tables — список столов', () => {
    it('returns list of tables for the tenant', async () => {
      const res = await request(app.getHttpServer())
        .get('/tables')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
      const names = (res.body as Array<{ name: string }>).map((t) => t.name);
      expect(names).toContain('Table 1');
      expect(names).toContain('Table 2');
    });

    it('returns 401 without token', async () => {
      const res = await request(app.getHttpServer()).get('/tables');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /tables/:id — переименование стола', () => {
    let tableId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/tables')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Table to Rename' });
      tableId = res.body.id as string;
    });

    it('updates table name', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/tables/${tableId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Renamed Table' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Renamed Table');
    });

    it('returns 404 for non-existent table id', async () => {
      const res = await request(app.getHttpServer())
        .patch('/tables/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Ghost' });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /tables/:id/qr — генерация QR-кода', () => {
    let tableId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/tables')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'QR Table' });
      tableId = res.body.id as string;
    });

    it('returns a PNG image with correct Content-Type', async () => {
      const res = await request(app.getHttpServer())
        .get(`/tables/${tableId}/qr`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/image\/png/);
    });

    it('returns a non-empty PNG buffer', async () => {
      const res = await request(app.getHttpServer())
        .get(`/tables/${tableId}/qr`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect((res.body as Buffer).length).toBeGreaterThan(100);
    });

    // Verifying the QR-encoded URL content requires a QR-decoding library (e.g. @zxing/library).
    // Add it to devDependencies and decode the PNG buffer to assert the expected guest URL:
    // `${APP_URL}/menu/${tenantSlug}?table=${tableId}`
  });

  describe('DELETE /tables/:id — удаление стола', () => {
    it('deletes a table without active orders and returns 204', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/tables')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Table to Delete' });
      const tableId = createRes.body.id as string;

      const res = await request(app.getHttpServer())
        .delete(`/tables/${tableId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(204);

      const getRes = await request(app.getHttpServer())
        .get('/tables')
        .set('Authorization', `Bearer ${ownerToken}`);
      const ids = (getRes.body as Array<{ id: string }>).map((t) => t.id);
      expect(ids).not.toContain(tableId);
    });

    it('returns 400 when table has active orders (NEW)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/tables')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Busy Table NEW' });
      const tableId = createRes.body.id as string;

      await dataSource.query(
        `INSERT INTO orders ("tableId", status) VALUES ($1, 'NEW')`,
        [tableId],
      );

      const res = await request(app.getHttpServer())
        .delete(`/tables/${tableId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(400);

      await dataSource.query(`DELETE FROM orders WHERE "tableId" = $1`, [tableId]);
      await dataSource.query(`DELETE FROM tables WHERE id = $1`, [tableId]);
    });

    it('returns 400 when table has active orders (IN_PROGRESS)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/tables')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Busy Table IN_PROGRESS' });
      const tableId = createRes.body.id as string;

      await dataSource.query(
        `INSERT INTO orders ("tableId", status) VALUES ($1, 'IN_PROGRESS')`,
        [tableId],
      );

      const res = await request(app.getHttpServer())
        .delete(`/tables/${tableId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(400);

      await dataSource.query(`DELETE FROM orders WHERE "tableId" = $1`, [tableId]);
      await dataSource.query(`DELETE FROM tables WHERE id = $1`, [tableId]);
    });

    it('returns 404 for non-existent table', async () => {
      const res = await request(app.getHttpServer())
        .delete('/tables/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
    });

    it('cleans up historical (DONE/CANCELLED) orders when table is deleted', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/tables')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Table with History' });
      const histTableId = createRes.body.id as string;

      await dataSource.query(
        `INSERT INTO orders ("tableId", status) VALUES ($1, 'DONE'), ($1, 'CANCELLED')`,
        [histTableId],
      );

      const delRes = await request(app.getHttpServer())
        .delete(`/tables/${histTableId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(delRes.status).toBe(204);

      const [{ count }] = await dataSource.query(
        `SELECT COUNT(*)::int as count FROM orders WHERE "tableId" = $1`,
        [histTableId],
      );
      expect(count).toBe(0);
    });
  });

  describe('GET /public/tables/:tableId — публичный резолвинг стола', () => {
    let tableId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/tables')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Public Table' });
      tableId = res.body.id as string;
    });

    it('returns tableId, tableName, tenantSlug without auth', async () => {
      const res = await request(app.getHttpServer())
        .get(`/public/tables/${tableId}`);

      expect(res.status).toBe(200);
      expect(res.body.tableId).toBe(tableId);
      expect(res.body.tableName).toBe('Public Table');
      expect(res.body.tenantSlug).toBe(tenantSlug);
    });

    it('returns 404 for unknown tableId', async () => {
      const res = await request(app.getHttpServer())
        .get('/public/tables/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(404);
    });
  });

  describe('Tenant isolation — другой тенант не получает доступ к чужим столам', () => {
    let otherToken: string;
    let myTableId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'BNP11 Other Restaurant', email: 'other-bnp11@test.com', password: 'password123' });
      otherToken = res.body.accessToken as string;

      const tableRes = await request(app.getHttpServer())
        .post('/tables')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Private Table' });
      myTableId = tableRes.body.id as string;
    });

    it('PATCH by other tenant returns 403 or 404', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/tables/${myTableId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'Hijacked' });

      expect([403, 404]).toContain(res.status);
    });

    it('DELETE by other tenant returns 403 or 404', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/tables/${myTableId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect([403, 404]).toContain(res.status);
    });

    it('GET /tables returns only own tenant tables', async () => {
      const res = await request(app.getHttpServer())
        .get('/tables')
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(200);
      const ids = (res.body as Array<{ id: string }>).map((t) => t.id);
      expect(ids).not.toContain(myTableId);
    });

    it('GET /tables/:id/qr by other tenant returns 404', async () => {
      const res = await request(app.getHttpServer())
        .get(`/tables/${myTableId}/qr`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(404);
    });
  });
});
