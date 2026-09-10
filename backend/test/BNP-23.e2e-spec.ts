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

describe('BNP-23: Регистрация с дублирующимся email или slug — возвращена ошибка конфликта', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const firstEmail = 'owner-bnp23@test.com';
  const password = 'password123';
  const name = 'BNP23 Cafe';

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
      .send({ name, email: firstEmail, password });
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM users WHERE email LIKE '%bnp23%'`);
    await dataSource.query(`DELETE FROM tenants WHERE slug LIKE '%bnp23%'`);
    await app.close();
  });

  it('POST /auth/register with duplicate email returns 409', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'BNP23 Other Cafe', email: firstEmail, password });

    expect(res.status).toBe(409);
  });

  it('POST /auth/register with duplicate venue name (slug collision) returns 409', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email: 'owner2-bnp23@test.com', password });

    expect(res.status).toBe(409);
  });
});
