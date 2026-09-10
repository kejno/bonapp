process.env.JWT_SECRET = 'test-e2e-secret';
process.env.DB_PASSWORD = 'postgres';
process.env.NODE_ENV = 'test';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { JwtAuthGuard } from '../src/identity/guards/jwt-auth.guard.js';

describe('BNP-22: Аутентификация пользователя — возвращён JWT access token сроком 24 часа', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const email = 'owner-bnp22@test.com';
  const password = 'password123';
  const name = 'BNP22 Cafe';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleFixture.get(DataSource);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email, password });
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM users WHERE email LIKE '%bnp22%'`);
    await dataSource.query(`DELETE FROM tenants WHERE slug LIKE '%bnp22%'`);
    await app.close();
  });

  it('POST /auth/login returns 200 with accessToken', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.accessToken.split('.').length).toBe(3);
  });

  it('JWT access token has 24-hour expiry', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });

    expect(res.status).toBe(200);
    const token = res.body.accessToken as string;
    const [, payloadB64] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    expect(payload).toHaveProperty('exp');
    expect(payload).toHaveProperty('iat');
    const ttlSeconds = payload.exp - payload.iat;
    expect(ttlSeconds).toBe(86400);
  });

  it('JWT payload contains sub, tenantId, and role', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });

    const token = res.body.accessToken as string;
    const [, payloadB64] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    expect(payload).toHaveProperty('sub');
    expect(payload).toHaveProperty('tenantId');
    expect(payload).toHaveProperty('role');
    expect(payload.role).toBe('OWNER');
  });
});
