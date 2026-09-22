import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { CacheService } from '../src/cache/cache.service';
import { GuestMenuController } from '../src/menu/guest-menu.controller';
import { MenuService } from '../src/menu/menu.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('BNP-340: guest menu cache', () => {
  let app: INestApplication<App>;
  const storedMenus = new Map<string, unknown>();
  const cache = {
    getJson: jest.fn((key: string) => Promise.resolve(storedMenus.get(key) ?? null)),
    setJson: jest.fn((key: string, value: unknown) => {
      storedMenus.set(key, value);
      return Promise.resolve();
    }),
  };
  const menu = [{ id: 'category-1', items: [{ id: 'item-1', name: 'Espresso' }] }];
  const prisma = {
    forTenant: jest.fn(),
    menuCategory: { findMany: jest.fn(() => Promise.resolve(menu)) },
  };

  beforeEach(async () => {
    storedMenus.clear();
    jest.clearAllMocks();
    prisma.forTenant.mockReturnValue(prisma);

    const module = await Test.createTestingModule({
      controllers: [GuestMenuController],
      providers: [
        MenuService,
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

  it('returns the Redis-cached catalog on a repeated request within 60 seconds', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/guest/menu?tenantId=tenant-1')
      .expect(200)
      .expect(menu);
    await request(app.getHttpServer())
      .get('/api/v1/guest/menu?tenantId=tenant-1')
      .expect(200)
      .expect(menu);

    expect(prisma.menuCategory.findMany).toHaveBeenCalledTimes(1);
    expect(cache.getJson).toHaveBeenCalledWith('menu:tenant:tenant-1');
    expect(cache.setJson).toHaveBeenCalledWith('menu:tenant:tenant-1', menu, 60);
  });
});
