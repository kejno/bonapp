import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { CacheService } from '../src/cache/cache.service';
import { GuestMenuController } from '../src/menu/guest-menu.controller';
import { MenuAdminService } from '../src/menu/menu-admin.service';
import { MenuService } from '../src/menu/menu.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('BNP-342: modifier changes invalidate guest menu cache', () => {
  let app: INestApplication<App>;
  let menu = [{ id: 'category-1', items: [{ id: 'item-1', modifierGroups: [{ modifierGroup: { id: 'group-1', modifiers: [{ id: 'modifier-1', name: 'Milk' }] } }] }] }];
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
    menuCategory: { findMany: jest.fn(() => Promise.resolve(menu)) },
    modifierGroup: { update: jest.fn(() => Promise.resolve({ id: 'group-1' })) },
    modifier: { update: jest.fn(() => Promise.resolve({ id: 'modifier-1' })) },
  };
  let menuAdminService: MenuAdminService;

  beforeEach(async () => {
    storedMenus.clear();
    jest.clearAllMocks();
    menu = [{ id: 'category-1', items: [{ id: 'item-1', modifierGroups: [{ modifierGroup: { id: 'group-1', modifiers: [{ id: 'modifier-1', name: 'Milk' }] } }] }] }];
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
    ['modifier group', () => menuAdminService.updateModifierGroup('tenant-1', 'group-1', { name: 'Plant milk' })],
    ['modifier', () => menuAdminService.updateModifier('tenant-1', 'modifier-1', { name: 'Oat milk' })],
  ])('reloads the catalog after a %s update', async (_entity, update) => {
    await request(app.getHttpServer()).get('/api/v1/guest/menu?tenantId=tenant-1').expect(200);
    menu = [{ id: 'category-1', items: [{ id: 'item-1', modifierGroups: [{ modifierGroup: { id: 'group-1', modifiers: [{ id: 'modifier-1', name: 'Oat milk' }] } }] }] }];

    await update();
    await request(app.getHttpServer())
      .get('/api/v1/guest/menu?tenantId=tenant-1')
      .expect(200)
      .expect(menu);

    expect(cache.del).toHaveBeenCalledWith('menu:tenant:tenant-1');
    expect(prisma.menuCategory.findMany).toHaveBeenCalledTimes(2);
  });
});
