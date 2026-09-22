import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { CacheService } from '../src/cache/cache.service';
import { GuestMenuController } from '../src/menu/guest-menu.controller';
import { MenuAdminService } from '../src/menu/menu-admin.service';
import { MenuService } from '../src/menu/menu.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('BNP-341: item and category changes invalidate guest menu cache', () => {
  let app: INestApplication<App>;
  let menu = [{ id: 'category-1', name: 'Coffee', items: [{ id: 'item-1', name: 'Espresso' }] }];
  const storedMenus = new Map<string, unknown>();
  const cache = {
    getJson: jest.fn((key: string) => Promise.resolve(storedMenus.get(key) ?? null)),
    setJson: jest.fn((key: string, value: unknown) => {
      storedMenus.set(key, value);
      return Promise.resolve();
    }),
    del: jest.fn((key: string) => {
      storedMenus.delete(key);
      return Promise.resolve();
    }),
  };
  const prisma = {
    forTenant: jest.fn(),
    menuCategory: {
      findMany: jest.fn(() => Promise.resolve(menu)),
      update: jest.fn(() => Promise.resolve({ id: 'category-1' })),
    },
    menuItem: { update: jest.fn(() => Promise.resolve({ id: 'item-1' })) },
  };
  let menuAdminService: MenuAdminService;

  beforeEach(async () => {
    storedMenus.clear();
    jest.clearAllMocks();
    menu = [{ id: 'category-1', name: 'Coffee', items: [{ id: 'item-1', name: 'Espresso' }] }];
    prisma.forTenant.mockReturnValue(prisma);

    const module = await Test.createTestingModule({
      controllers: [GuestMenuController],
      providers: [
        MenuService,
        MenuAdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    menuAdminService = module.get(MenuAdminService);
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    ['item', () => menuAdminService.updateItem('tenant-1', 'item-1', { name: 'Double espresso' }), [{ id: 'category-1', name: 'Coffee', items: [{ id: 'item-1', name: 'Double espresso' }] }]],
    ['category', () => menuAdminService.updateCategory('tenant-1', 'category-1', { name: 'Hot drinks' }), [{ id: 'category-1', name: 'Hot drinks', items: [{ id: 'item-1', name: 'Espresso' }] }]],
  ])('reloads the catalog after a %s update', async (_entity, update, updatedMenu) => {
    await request(app.getHttpServer()).get('/api/v1/guest/menu?tenantId=tenant-1').expect(200);
    menu = updatedMenu;

    await update();
    await request(app.getHttpServer())
      .get('/api/v1/guest/menu?tenantId=tenant-1')
      .expect(200)
      .expect(updatedMenu);

    expect(cache.del).toHaveBeenCalledWith('menu:tenant:tenant-1');
    expect(prisma.menuCategory.findMany).toHaveBeenCalledTimes(2);
  });
});
