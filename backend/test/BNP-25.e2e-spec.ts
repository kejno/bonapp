process.env.JWT_SECRET = 'test-e2e-secret';
process.env.DB_PASSWORD = 'postgres';
process.env.NODE_ENV = 'test';

import {
  Controller,
  Get,
  INestApplication,
  Module,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
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
import { CurrentUser } from '../src/identity/decorators/current-user.decorator.js';
import { Roles } from '../src/identity/decorators/roles.decorator.js';
import { Tenant } from '../src/identity/entities/tenant.entity.js';
import { Role, User } from '../src/identity/entities/user.entity.js';
import { JwtAuthGuard } from '../src/identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../src/identity/guards/roles.guard.js';
import { JwtStrategy } from '../src/identity/jwt.strategy.js';

@Controller('test-guard-bnp25')
class TestGuardController {
  @Get('owner-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  ownerOnly(@CurrentUser() user: { userId: string; tenantId: string }) {
    return { ok: true, userId: user.userId, tenantId: user.tenantId };
  }
}

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
    TypeOrmModule.forFeature([Tenant, User]),
  ],
  controllers: [AuthController, TestGuardController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, RolesGuard],
})
class TestAppModule {}

describe('BNP-25: Доступ к защищённому эндпоинту без токена и с недостаточной ролью — запрос отклонён', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let ownerToken: string;
  let staffToken: string;

  const ownerEmail = 'owner-bnp25@test.com';
  const staffEmail = 'staff-bnp25@test.com';
  const password = 'password123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleFixture.get(DataSource);

    const ownerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'BNP25 Owner Cafe', email: ownerEmail, password });
    ownerToken = ownerRes.body.accessToken;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'BNP25 Staff Cafe', email: staffEmail, password });

    await dataSource.query(`UPDATE users SET role = 'STAFF' WHERE email = '${staffEmail}'`);

    const staffRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: staffEmail, password });
    staffToken = staffRes.body.accessToken;
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM users WHERE email LIKE '%bnp25%'`);
    await dataSource.query(`DELETE FROM tenants WHERE slug LIKE '%bnp25%'`);
    await app.close();
  });

  it('GET /test-guard-bnp25/owner-only without token returns 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-guard-bnp25/owner-only');

    expect(res.status).toBe(401);
  });

  it('GET /test-guard-bnp25/owner-only with STAFF token returns 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-guard-bnp25/owner-only')
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(403);
  });

  it('GET /test-guard-bnp25/owner-only with OWNER token returns 200 and correct userId/tenantId', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-guard-bnp25/owner-only')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);

    const [, payloadB64] = ownerToken.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
      sub: string;
      tenantId: string;
    };

    expect(res.body.ok).toBe(true);
    expect(res.body.userId).toBe(payload.sub);
    expect(res.body.tenantId).toBe(payload.tenantId);
  });
});
