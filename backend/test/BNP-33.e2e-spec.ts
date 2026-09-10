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

describe('BNP-33: CRUD категорий меню — категория создаётся, обновляется и удаляется владельцем', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let ownerToken: string;
  let tenantId: string;

  const email = 'owner-bnp33@test.com';
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
      .send({ name: 'BNP33 Cafe', email, password });
    ownerToken = res.body.accessToken;

    const [t] = await dataSource.query(`SELECT id FROM tenants WHERE slug = 'bnp33-cafe'`);
    tenantId = t.id;
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM menu_items WHERE "tenantId" = $1`, [tenantId]);
    await dataSource.query(`DELETE FROM menu_categories WHERE "tenantId" = $1`, [tenantId]);
    await dataSource.query(`DELETE FROM users WHERE email LIKE '%bnp33%'`);
    await dataSource.query(`DELETE FROM tenants WHERE slug LIKE '%bnp33%'`);
    await app.close();
  });

  let createdCategoryId: string;

  it('GET /menu/categories returns 401 without token', async () => {
    const res = await request(app.getHttpServer()).get('/menu/categories');
    expect(res.status).toBe(401);
  });

  it('POST /menu/categories creates a new category and returns it', async () => {
    const res = await request(app.getHttpServer())
      .post('/menu/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Burgers', sortOrder: 1, isVisible: true });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('Burgers');
    expect(res.body.sortOrder).toBe(1);
    expect(res.body.isVisible).toBe(true);
    expect(res.body.tenantId).toBe(tenantId);
    createdCategoryId = res.body.id;
  });

  it('GET /menu/categories returns the created category', async () => {
    const res = await request(app.getHttpServer())
      .get('/menu/categories')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    const found = (res.body as Array<{ id: string; name: string }>).find(
      c => c.id === createdCategoryId,
    );
    expect(found).toBeDefined();
    expect(found!.name).toBe('Burgers');
  });

  it('PATCH /menu/categories/:id updates the category name and sortOrder', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/menu/categories/${createdCategoryId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Gourmet Burgers', sortOrder: 5 });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Gourmet Burgers');
    expect(res.body.sortOrder).toBe(5);
  });

  it('DELETE /menu/categories/:id deletes the empty category and returns 204', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/menu/categories/${createdCategoryId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(204);
  });

  it('GET /menu/categories no longer contains the deleted category', async () => {
    const res = await request(app.getHttpServer())
      .get('/menu/categories')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string }>).map(c => c.id);
    expect(ids).not.toContain(createdCategoryId);
  });

  it('POST /menu/categories returns 400 when name is missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/menu/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ sortOrder: 0 });

    expect(res.status).toBe(400);
  });
});
