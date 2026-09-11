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

describe('BNP-35: Удаление категории меню с существующими позициями — запрос отклонён', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let ownerToken: string;
  let tenantId: string;
  let categoryWithItemsId: string;
  let emptyCategoryId: string;

  const email = 'owner-bnp35@test.com';
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
      .send({ name: 'BNP35 Cafe', email, password });
    ownerToken = res.body.accessToken;

    const [t] = await dataSource.query(`SELECT id FROM tenants WHERE slug = 'bnp35-cafe'`);
    tenantId = t.id;

    const [cat] = await dataSource.query(
      `INSERT INTO menu_categories ("tenantId", name, "sortOrder", "isVisible") VALUES ($1, 'Filled Category', 0, true) RETURNING id`,
      [tenantId],
    );
    categoryWithItemsId = cat.id;

    const [empty] = await dataSource.query(
      `INSERT INTO menu_categories ("tenantId", name, "sortOrder", "isVisible") VALUES ($1, 'Empty Category', 1, true) RETURNING id`,
      [tenantId],
    );
    emptyCategoryId = empty.id;

    await dataSource.query(
      `INSERT INTO menu_items ("tenantId", "categoryId", name, price, "isAvailable") VALUES ($1, $2, 'Item1', 5.00, true)`,
      [tenantId, categoryWithItemsId],
    );
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM menu_items WHERE "tenantId" = $1`, [tenantId]);
    await dataSource.query(`DELETE FROM menu_categories WHERE "tenantId" = $1`, [tenantId]);
    await dataSource.query(`DELETE FROM users WHERE email LIKE '%bnp35%'`);
    await dataSource.query(`DELETE FROM tenants WHERE slug LIKE '%bnp35%'`);
    await app.close();
  });

  it('DELETE /menu/categories/:id with existing items returns 409', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/menu/categories/${categoryWithItemsId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('message');
  });

  it('category with items still exists after rejected delete', async () => {
    const res = await request(app.getHttpServer())
      .get('/menu/categories')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string }>).map(c => c.id);
    expect(ids).toContain(categoryWithItemsId);
  });

  it('items inside the category are preserved after rejected delete', async () => {
    const res = await request(app.getHttpServer())
      .get(`/menu/items?categoryId=${categoryWithItemsId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect((res.body as Array<unknown>).length).toBeGreaterThan(0);
  });

  it('DELETE /menu/categories/:id on empty category returns 204 (positive control)', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/menu/categories/${emptyCategoryId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(204);
  });
});
