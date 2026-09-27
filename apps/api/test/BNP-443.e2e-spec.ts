import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GuestMenuController } from '../src/menu/guest-menu.controller';
import { GuestSessionGuard } from '../src/guest-session/guest-session.guard';
import { MenuService } from '../src/menu/menu.service';
import { CacheService } from '../src/cache/cache.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { App } from 'supertest/types';

describe('BNP-443: guest menu catalog', () => {
  let app: INestApplication<App>;
  let catalogQuery: {
    where: { tenantId: string; isActive: boolean };
    include: { menuItems: { where: { isActive: boolean } } };
  } | undefined;
  const prisma = {
    forTenant: jest.fn(),
    menuCategory: {
      findMany: jest.fn((query: NonNullable<typeof catalogQuery>) => {
        catalogQuery = query;
        const menuItems = [
          {
            id: 'item-1', name: 'Espresso', description: null, priceByn: '3.50', imageUrl: null,
            weightGrams: null, calories: null, proteins: null, fats: null, carbs: null,
            allergens: [], kitchenDepartment: 'BAR', cookingTimeMinutes: null, isInStopList: false,
            isHit: false, isActive: true, stopListItem: null,
            menuItemModifierGroups: [{ sortOrder: 0, modifierGroup: {
              id: 'group-1', name: 'Milk options', isActive: true,
              modifiers: [{ id: 'modifier-1', name: 'Oat milk', price: '0.50' }],
            } }],
            modifierGroups: [],
          },
          { id: 'inactive-item', name: 'Inactive dish', isActive: false, menuItemModifierGroups: [], modifierGroups: [] },
        ].filter((item) => !query.include.menuItems.where.isActive || item.isActive);
        return Promise.resolve([{ id: 'category-1', name: 'Coffee', menuItems }]);
      }),
    },
  };
  prisma.forTenant.mockReturnValue(prisma);
  const cache = { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [GuestMenuController],
      providers: [MenuService, { provide: PrismaService, useValue: prisma }, { provide: CacheService, useValue: cache }],
    })
      .overrideGuard(GuestSessionGuard)
      .useValue({ canActivate: (context: { switchToHttp: () => { getRequest: () => { tenantId?: string } } }) => {
        context.switchToHttp().getRequest().tenantId = 'tenant-1';
        return true;
      } })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => app.close());

  it('returns active categories, active dishes and their modifiers, excluding inactive dishes', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/guest/menu?tenantId=tenant-1')
      .expect(200);

    const categories = response.body as Array<{
      id: string;
      name: string;
      items: Array<{ id: string; name: string; isActive: boolean; modifierGroups: Array<{ modifierGroup: { id: string; modifiers: Array<{ id: string; name: string; price: string }> } }> }>;
    }>;
    expect(categories).toHaveLength(1);
    expect(categories[0]).toMatchObject({ id: 'category-1', name: 'Coffee' });
    expect(categories[0].items).toHaveLength(1);
    expect(categories[0].items[0]).toMatchObject({
      id: 'item-1',
      name: 'Espresso',
      isActive: true,
      modifierGroups: [
        {
          modifierGroup: {
            id: 'group-1',
            modifiers: [{ id: 'modifier-1', name: 'Oat milk', price: '0.50' }],
          },
        },
      ],
    });
    expect(prisma.forTenant).toHaveBeenCalledWith('tenant-1');
    expect(prisma.menuCategory.findMany).toHaveBeenCalledTimes(1);
    expect(catalogQuery?.where).toEqual({ tenantId: 'tenant-1', isActive: true });
    expect(catalogQuery?.include.menuItems.where).toEqual({ isActive: true });
  });
});
