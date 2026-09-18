import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { CacheService } from '../src/cache/cache.service';
import { GuestMenuController } from '../src/menu/guest-menu.controller';
import { MenuAdminService } from '../src/menu/menu-admin.service';
import { MenuService } from '../src/menu/menu.service';
import { StopListController } from '../src/menu/stop-list.controller';
import { PrismaService } from '../src/prisma/prisma.service';

describe('menu cache (e2e)', () => {
  let app: INestApplication<App>;
  const storedMenus = new Map<string, unknown>();
  const cache = {
    getJson: jest.fn((key: string) =>
      Promise.resolve(storedMenus.get(key) ?? null),
    ),
    setJson: jest.fn((key: string, value: unknown) => {
      storedMenus.set(key, value);
      return Promise.resolve();
    }),
    del: jest.fn((key: string) => {
      storedMenus.delete(key);
      return Promise.resolve();
    }),
  };
  let menu = [{ id: 'category-1', items: [{ id: 'item-1' }] }];
  const prisma = {
    menuCategory: { findMany: jest.fn(() => Promise.resolve(menu)) },
    stopListItem: {
      upsert: jest.fn(() => Promise.resolve({ id: 'stop-list-1' })),
    },
  };

  beforeEach(async () => {
    storedMenus.clear();
    jest.clearAllMocks();
    menu = [{ id: 'category-1', items: [{ id: 'item-1' }] }];

    const module = await Test.createTestingModule({
      controllers: [GuestMenuController, StopListController],
      providers: [
        MenuService,
        MenuAdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves a cached menu and reloads it from the database after a stop-list update', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/guest/menu?tenantId=tenant-1')
      .expect(200)
      .expect(menu);

    await request(app.getHttpServer())
      .get('/api/v1/guest/menu?tenantId=tenant-1')
      .expect(200)
      .expect(menu);
    expect(prisma.menuCategory.findMany).toHaveBeenCalledTimes(1);

    menu = [{ id: 'category-1', items: [{ id: 'item-1', isStopped: true }] }];
    await request(app.getHttpServer())
      .patch('/api/v1/stop-list')
      .send({ tenantId: 'tenant-1', itemId: 'item-1', isStopped: true })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/guest/menu?tenantId=tenant-1')
      .expect(200)
      .expect(menu);
    expect(prisma.menuCategory.findMany).toHaveBeenCalledTimes(2);
    expect(cache.del).toHaveBeenCalledWith('menu:tenant:tenant-1');
  });
});
