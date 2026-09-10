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

describe('BNP-21: Регистрация нового заведения — Tenant и User[OWNER] созданы, возвращён JWT', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

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
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM users WHERE email LIKE '%bnp21%'`);
    await dataSource.query(`DELETE FROM tenants WHERE slug LIKE '%bnp21%'`);
    await app.close();
  });

  it('POST /auth/register returns 201 with accessToken', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'BNP21 Cafe', email: 'owner-bnp21@test.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.accessToken.split('.').length).toBe(3);
  });

  it('POST /auth/register creates a Tenant record in the database', async () => {
    const rows = await dataSource.query(`SELECT * FROM tenants WHERE slug = 'bnp21-cafe'`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].name).toBe('BNP21 Cafe');
    expect(rows[0].slug).toBe('bnp21-cafe');
  });

  it('POST /auth/register creates a User with OWNER role in the database', async () => {
    const rows = await dataSource.query(`SELECT * FROM users WHERE email = 'owner-bnp21@test.com'`);
    expect(rows.length).toBe(1);
    expect(rows[0].role).toBe('OWNER');
    expect(rows[0].email).toBe('owner-bnp21@test.com');
  });

  it('POST /auth/register returns 400 for missing required fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'incomplete@test.com' });

    expect(res.status).toBe(400);
  });
});
