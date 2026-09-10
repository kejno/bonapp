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

describe('BNP-32: Запрос к меню чужого тенанта с валидным JWT — операция отклонена', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  let tenant1Id: string;
  let tenant2Id: string;
  let category1Id: string;
  let category2Id: string;
  let item1Id: string;
  let item2Id: string;
  let tenant1Token: string;

  const tenant1Email = 'owner-bnp32-t1@test.com';
  const tenant2Email = 'owner-bnp32-t2@test.com';
  const password = 'password123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestMenuModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleFixture.get(DataSource);

    const t1Res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'BNP32 Tenant1', email: tenant1Email, password });
    tenant1Token = t1Res.body.accessToken;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'BNP32 Tenant2', email: tenant2Email, password });

    const [t1] = await dataSource.query(`SELECT id FROM tenants WHERE slug = 'bnp32-tenant1'`);
    tenant1Id = t1.id;

    const [t2] = await dataSource.query(`SELECT id FROM tenants WHERE slug = 'bnp32-tenant2'`);
    tenant2Id = t2.id;

    const [cat1] = await dataSource.query(
      `INSERT INTO menu_categories ("tenantId", name, "sortOrder", "isVisible") VALUES ($1, 'Cat Tenant1', 0, true) RETURNING id`,
      [tenant1Id],
    );
    category1Id = cat1.id;

    const [cat2] = await dataSource.query(
      `INSERT INTO menu_categories ("tenantId", name, "sortOrder", "isVisible") VALUES ($1, 'Cat Tenant2', 0, true) RETURNING id`,
      [tenant2Id],
    );
    category2Id = cat2.id;

    const [it1] = await dataSource.query(
      `INSERT INTO menu_items ("tenantId", "categoryId", name, price, "isAvailable") VALUES ($1, $2, 'Item Tenant1', 5.00, true) RETURNING id`,
      [tenant1Id, category1Id],
    );
    item1Id = it1.id;

    const [it2] = await dataSource.query(
      `INSERT INTO menu_items ("tenantId", "categoryId", name, price, "isAvailable") VALUES ($1, $2, 'Item Tenant2', 7.00, true) RETURNING id`,
      [tenant2Id, category2Id],
    );
    item2Id = it2.id;
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM menu_items WHERE "tenantId" IN ($1, $2)`, [tenant1Id, tenant2Id]);
    await dataSource.query(`DELETE FROM menu_categories WHERE "tenantId" IN ($1, $2)`, [tenant1Id, tenant2Id]);
    await dataSource.query(`DELETE FROM users WHERE email LIKE '%bnp32%'`);
    await dataSource.query(`DELETE FROM tenants WHERE slug LIKE '%bnp32%'`);
    await app.close();
  });

  it("GET /menu/categories returns only tenant1's own categories", async () => {
    const res = await request(app.getHttpServer())
      .get('/menu/categories')
      .set('Authorization', `Bearer ${tenant1Token}`);

    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string }>).map(c => c.id);
    expect(ids).toContain(category1Id);
    expect(ids).not.toContain(category2Id);
  });

  it('PATCH /menu/categories/:id of tenant2 with tenant1 token returns 404', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/menu/categories/${category2Id}`)
      .set('Authorization', `Bearer ${tenant1Token}`)
      .send({ name: 'Hacked' });

    expect(res.status).toBe(404);
  });

  it('DELETE /menu/categories/:id of tenant2 with tenant1 token returns 404', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/menu/categories/${category2Id}`)
      .set('Authorization', `Bearer ${tenant1Token}`);

    expect(res.status).toBe(404);
  });

  it("GET /menu/items returns only tenant1's own items", async () => {
    const res = await request(app.getHttpServer())
      .get('/menu/items')
      .set('Authorization', `Bearer ${tenant1Token}`);

    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string }>).map(i => i.id);
    expect(ids).toContain(item1Id);
    expect(ids).not.toContain(item2Id);
  });

  it('PATCH /menu/items/:id of tenant2 with tenant1 token returns 404', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/menu/items/${item2Id}`)
      .set('Authorization', `Bearer ${tenant1Token}`)
      .send({ name: 'Hacked Item' });

    expect(res.status).toBe(404);
  });

  it('DELETE /menu/items/:id of tenant2 with tenant1 token returns 404', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/menu/items/${item2Id}`)
      .set('Authorization', `Bearer ${tenant1Token}`);

    expect(res.status).toBe(404);
  });
});
