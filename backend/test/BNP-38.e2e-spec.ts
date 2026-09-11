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

describe('BNP-38: Генерация QR-кода для стола — возвращается PNG-буфер с корректным Content-Type', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let ownerToken: string;
  let tenantId: string;
  let tableId: string;

  const ownerEmail = 'owner-bnp38@test.com';
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
      .send({ name: 'BNP38 Restaurant', email: ownerEmail, password });

    ownerToken = res.body.accessToken as string;
    const [, payloadB64] = ownerToken.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
      sub: string;
      tenantId: string;
    };
    tenantId = payload.tenantId;

    const tableRes = await request(app.getHttpServer())
      .post('/tables')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'QR Table BNP38' });
    tableId = tableRes.body.id as string;
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM tables WHERE "tenantId" = $1`, [tenantId]);
    await dataSource.query(`DELETE FROM users WHERE email LIKE '%bnp38%'`);
    await dataSource.query(`DELETE FROM tenants WHERE slug LIKE '%bnp38%'`);
    await app.close();
  });

  it('GET /tables/:id/qr returns 200 with Content-Type image/png', async () => {
    const res = await request(app.getHttpServer())
      .get(`/tables/${tableId}/qr`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
  });

  it('GET /tables/:id/qr returns a non-empty PNG buffer', async () => {
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

  it('GET /tables/:id/qr returns 401 without token', async () => {
    const res = await request(app.getHttpServer()).get(`/tables/${tableId}/qr`);

    expect(res.status).toBe(401);
  });
});
