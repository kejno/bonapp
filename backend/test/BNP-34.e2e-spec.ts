process.env.JWT_SECRET = 'test-e2e-secret';
process.env.DB_PASSWORD = 'postgres';
process.env.NODE_ENV = 'test';

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
import { MenuCategory } from '../src/menu/entities/menu-category.entity.js';
import { MenuItem } from '../src/menu/entities/menu-item.entity.js';
import { MenuCategoryController } from '../src/menu/menu-category.controller.js';
import { MenuCategoryService } from '../src/menu/menu-category.service.js';
import { MenuItemController } from '../src/menu/menu-item.controller.js';
import { MenuItemService } from '../src/menu/menu-item.service.js';
import { PublicMenuController } from '../src/menu/public-menu.controller.js';
import { PublicMenuService } from '../src/menu/public-menu.service.js';

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
    TypeOrmModule.forFeature([Tenant, User, MenuCategory, MenuItem]),
  ],
  controllers: [
    AuthController,
    MenuCategoryController,
    MenuItemController,
    PublicMenuController,
  ],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    MenuCategoryService,
    MenuItemService,
    PublicMenuService,
  ],
})
class TestMenuModule {}

describe('BNP-34: CRUD позиций меню — позиция создаётся, обновляется и удаляется', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let ownerToken: string;
  let tenantId: string;
  let categoryId: string;

  const email = 'owner-bnp34@test.com';
  const password = 'password123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestMenuModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleFixture.get(DataSource);

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'BNP34 Cafe', email, password });
    ownerToken = res.body.accessToken;

    const [t] = await dataSource.query(`SELECT id FROM tenants WHERE slug = 'bnp34-cafe'`);
    tenantId = t.id;

    const [cat] = await dataSource.query(
      `INSERT INTO menu_categories ("tenantId", name, "sortOrder", "isVisible") VALUES ($1, 'Main', 0, true) RETURNING id`,
      [tenantId],
    );
    categoryId = cat.id;
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM menu_items WHERE "tenantId" = $1`, [tenantId]);
    await dataSource.query(`DELETE FROM menu_categories WHERE "tenantId" = $1`, [tenantId]);
    await dataSource.query(`DELETE FROM users WHERE email LIKE '%bnp34%'`);
    await dataSource.query(`DELETE FROM tenants WHERE slug LIKE '%bnp34%'`);
    await app.close();
  });

  let createdItemId: string;

  it('GET /menu/items returns 401 without token', async () => {
    const res = await request(app.getHttpServer()).get('/menu/items');
    expect(res.status).toBe(401);
  });

  it('POST /menu/items creates a new item and returns it', async () => {
    const res = await request(app.getHttpServer())
      .post('/menu/items')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        categoryId,
        name: 'Cheeseburger',
        description: 'Classic cheeseburger',
        price: 8.99,
        isAvailable: true,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('Cheeseburger');
    expect(res.body.price).toBe(8.99);
    expect(res.body.isAvailable).toBe(true);
    expect(res.body.categoryId).toBe(categoryId);
    expect(res.body.tenantId).toBe(tenantId);
    createdItemId = res.body.id;
  });

  it('GET /menu/items returns the created item', async () => {
    const res = await request(app.getHttpServer())
      .get('/menu/items')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    const found = (res.body as Array<{ id: string }>).find(i => i.id === createdItemId);
    expect(found).toBeDefined();
  });

  it('GET /menu/items?categoryId= filters by category', async () => {
    const res = await request(app.getHttpServer())
      .get(`/menu/items?categoryId=${categoryId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string }>).map(i => i.id);
    expect(ids).toContain(createdItemId);
  });

  it('PATCH /menu/items/:id updates name and price', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/menu/items/${createdItemId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Double Cheeseburger', price: 12.5 });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Double Cheeseburger');
    expect(res.body.price).toBe(12.5);
  });

  it('PATCH /menu/items/:id can toggle isAvailable to false', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/menu/items/${createdItemId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ isAvailable: false });

    expect(res.status).toBe(200);
    expect(res.body.isAvailable).toBe(false);
  });

  it('DELETE /menu/items/:id deletes the item and returns 204', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/menu/items/${createdItemId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(204);
  });

  it('GET /menu/items no longer contains the deleted item', async () => {
    const res = await request(app.getHttpServer())
      .get('/menu/items')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string }>).map(i => i.id);
    expect(ids).not.toContain(createdItemId);
  });

  it('POST /menu/items returns 400 when required fields are missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/menu/items')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Incomplete' });

    expect(res.status).toBe(400);
  });

  it('POST /menu/items returns 404 when categoryId does not exist for the tenant', async () => {
    const res = await request(app.getHttpServer())
      .post('/menu/items')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        categoryId: '00000000-0000-0000-0000-000000000000',
        name: 'Invalid',
        price: 5.0,
      });

    expect(res.status).toBe(404);
  });
});
