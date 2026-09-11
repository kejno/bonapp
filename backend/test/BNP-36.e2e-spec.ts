process.env.JWT_SECRET = 'test-e2e-secret';
process.env.DB_PASSWORD = 'postgres';
process.env.NODE_ENV = 'test';
process.env.APP_URL = 'http://localhost:5173';

import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AuthController } from '../src/identity/auth.controller.js';
import { AuthService } from '../src/identity/auth.service.js';
import { Tenant } from '../src/identity/entities/tenant.entity.js';
import { User } from '../src/identity/entities/user.entity.js';
import { JwtAuthGuard } from '../src/identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../src/identity/guards/roles.guard.js';
import { JwtStrategy } from '../src/identity/jwt.strategy.js';
import { Order } from '../src/order/entities/order.entity.js';
import { PublicTableController } from '../src/table/public-table.controller.js';
import { Table } from '../src/table/entities/table.entity.js';
import { TableController } from '../src/table/table.controller.js';
import { TableService } from '../src/table/table.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'postgres'),
        password: config.get<string>('DB_PASSWORD', 'postgres'),
        database: config.get<string>('DB_NAME', 'bonapp'),
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
    PassportModule.register({}),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
    }),
    TypeOrmModule.forFeature([Tenant, User, Table, Order]),
  ],
  controllers: [AuthController, TableController, PublicTableController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, RolesGuard, TableService],
})
class TestTableModule {}

describe('BNP-36: CRUD столов — стол создаётся, переименовывается и удаляется владельцем', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let ownerToken: string;
  let tenantId: string;

  const ownerEmail = 'owner-bnp36@test.com';
  const password = 'password123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestTableModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleFixture.get(DataSource);

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'BNP36 Restaurant', email: ownerEmail, password });

    ownerToken = res.body.accessToken as string;
    const [, payloadB64] = ownerToken.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
      sub: string;
      tenantId: string;
    };
    tenantId = payload.tenantId;
  });

  afterAll(async () => {
    await dataSource.query(
      `DELETE FROM orders WHERE "tableId" IN (SELECT id FROM tables WHERE "tenantId" = $1)`,
      [tenantId],
    );
    await dataSource.query(`DELETE FROM tables WHERE "tenantId" = $1`, [tenantId]);
    await dataSource.query(`DELETE FROM users WHERE email LIKE '%bnp36%'`);
    await dataSource.query(`DELETE FROM tenants WHERE slug LIKE '%bnp36%'`);
    await app.close();
  });

  it('POST /tables creates a table and returns 201 with table data', async () => {
    const res = await request(app.getHttpServer())
      .post('/tables')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Table A BNP36' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('Table A BNP36');
    expect(res.body.tenantId).toBe(tenantId);
    expect(res.body.description).toBeNull();
  });

  it('PATCH /tables/:id renames the table and returns 200 with updated name', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/tables')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Table to Rename BNP36' });
    const tableId = createRes.body.id as string;

    const res = await request(app.getHttpServer())
      .patch(`/tables/${tableId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Renamed Table BNP36' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(tableId);
    expect(res.body.name).toBe('Renamed Table BNP36');
  });

  it('DELETE /tables/:id removes the table and returns 204', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/tables')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Table to Delete BNP36' });
    const tableId = createRes.body.id as string;

    const deleteRes = await request(app.getHttpServer())
      .delete(`/tables/${tableId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(deleteRes.status).toBe(204);

    const listRes = await request(app.getHttpServer())
      .get('/tables')
      .set('Authorization', `Bearer ${ownerToken}`);
    const ids = (listRes.body as Array<{ id: string }>).map((t) => t.id);
    expect(ids).not.toContain(tableId);
  });
});
