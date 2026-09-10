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

describe('BNP-31: Публичный эндпоинт GET /public/menu/:slug — возвращает только доступные позиции', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let tenantId: string;
  let categoryId: string;
  const slug = 'bnp31-cafe';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestMenuModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleFixture.get(DataSource);

    const [tenant] = await dataSource.query(
      `INSERT INTO tenants (name, slug) VALUES ('BNP31 Cafe', $1) RETURNING id`,
      [slug],
    );
    tenantId = tenant.id;

    const [category] = await dataSource.query(
      `INSERT INTO menu_categories ("tenantId", name, "sortOrder", "isVisible") VALUES ($1, 'Drinks', 0, true) RETURNING id`,
      [tenantId],
    );
    categoryId = category.id;

    await dataSource.query(
      `INSERT INTO menu_items ("tenantId", "categoryId", name, price, "isAvailable") VALUES ($1, $2, 'Coffee', 3.50, true)`,
      [tenantId, categoryId],
    );
    await dataSource.query(
      `INSERT INTO menu_items ("tenantId", "categoryId", name, price, "isAvailable") VALUES ($1, $2, 'Tea', 2.00, false)`,
      [tenantId, categoryId],
    );
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM menu_items WHERE "tenantId" = $1`, [tenantId]);
    await dataSource.query(`DELETE FROM menu_categories WHERE "tenantId" = $1`, [tenantId]);
    await dataSource.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    await app.close();
  });

  it('GET /public/menu/:slug returns 200 with tenant info without Authorization header', async () => {
    const res = await request(app.getHttpServer()).get(`/public/menu/${slug}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('slug', slug);
    expect(res.body).toHaveProperty('name', 'BNP31 Cafe');
    expect(res.body).toHaveProperty('categories');
  });

  it('GET /public/menu/:slug returns only isAvailable=true items', async () => {
    const res = await request(app.getHttpServer()).get(`/public/menu/${slug}`);

    expect(res.status).toBe(200);
    const categories = res.body.categories as Array<{ items: Array<{ name: string; isAvailable: boolean }> }>;
    const allItems = categories.flatMap(c => c.items);

    expect(allItems.some(i => i.name === 'Coffee')).toBe(true);
    expect(allItems.every(i => i.isAvailable === true)).toBe(true);
    expect(allItems.some(i => i.name === 'Tea')).toBe(false);
  });

  it('GET /public/menu/:slug returns 404 for unknown slug', async () => {
    const res = await request(app.getHttpServer()).get('/public/menu/nonexistent-bnp31-slug');
    expect(res.status).toBe(404);
  });
});
