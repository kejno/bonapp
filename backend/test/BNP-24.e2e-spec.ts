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

describe('BNP-24: Аутентификация с неверными учётными данными — возвращена ошибка 401', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const email = 'owner-bnp24@test.com';
  const password = 'password123';

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
      .send({ name: 'BNP24 Cafe', email, password });
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM users WHERE email LIKE '%bnp24%'`);
    await dataSource.query(`DELETE FROM tenants WHERE slug LIKE '%bnp24%'`);
    await app.close();
  });

  it('POST /auth/login with non-existent email returns 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nonexistent-bnp24@test.com', password });

    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('accessToken');
  });

  it('POST /auth/login with wrong password returns 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('accessToken');
  });

  it('POST /auth/login 401 responses do not reveal which credential is wrong (anti-enumeration)', async () => {
    const resWrongEmail = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nonexistent-bnp24@test.com', password });

    const resWrongPass = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrongpassword' });

    expect(resWrongEmail.status).toBe(401);
    expect(resWrongPass.status).toBe(401);
    expect(resWrongEmail.body).toEqual(resWrongPass.body);
  });

  it('POST /auth/login with correct credentials returns 200 (positive control)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });
});
