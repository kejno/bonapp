import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { PublicMenuService } from './public-menu.service.js';
import { MenuCategory } from './entities/menu-category.entity.js';
import { MenuItem } from './entities/menu-item.entity.js';
import { Tenant } from '../identity/entities/tenant.entity.js';

const mockRepo = () => ({
  findOne: vi.fn(),
  find: vi.fn(),
});

const TENANT_ID = 'tenant-uuid';
const TENANT_SLUG = 'my-cafe';

const tenant = { id: TENANT_ID, name: 'My Cafe', slug: TENANT_SLUG };

describe('PublicMenuService', () => {
  let service: PublicMenuService;
  let tenantRepo: ReturnType<typeof mockRepo>;
  let categoryRepo: ReturnType<typeof mockRepo>;
  let itemRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicMenuService,
        { provide: getRepositoryToken(Tenant), useFactory: mockRepo },
        { provide: getRepositoryToken(MenuCategory), useFactory: mockRepo },
        { provide: getRepositoryToken(MenuItem), useFactory: mockRepo },
      ],
    }).compile();

    service = module.get(PublicMenuService);
    tenantRepo = module.get(getRepositoryToken(Tenant));
    categoryRepo = module.get(getRepositoryToken(MenuCategory));
    itemRepo = module.get(getRepositoryToken(MenuItem));
  });

  afterEach(() => vi.clearAllMocks());

  describe('getPublicMenu', () => {
    it('throws NotFoundException for unknown slug', async () => {
      tenantRepo.findOne.mockResolvedValue(null);

      await expect(service.getPublicMenu('unknown-slug')).rejects.toThrow(NotFoundException);
      expect(categoryRepo.find).not.toHaveBeenCalled();
    });

    it('returns menu with only visible categories and available items', async () => {
      const cats = [
        { id: 'cat-1', tenantId: TENANT_ID, name: 'Drinks', sortOrder: 0, isVisible: true },
        { id: 'cat-2', tenantId: TENANT_ID, name: 'Desserts', sortOrder: 1, isVisible: true },
      ];
      const items = [
        { id: 'i-1', tenantId: TENANT_ID, categoryId: 'cat-1', name: 'Tea', price: 2.5, isAvailable: true },
        { id: 'i-2', tenantId: TENANT_ID, categoryId: 'cat-1', name: 'Coffee', price: 3.0, isAvailable: true },
      ];
      tenantRepo.findOne.mockResolvedValue(tenant);
      categoryRepo.find.mockResolvedValue(cats);
      itemRepo.find.mockResolvedValue(items);

      const result = await service.getPublicMenu(TENANT_SLUG);

      expect(categoryRepo.find).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, isVisible: true },
        order: { sortOrder: 'ASC' },
      });
      expect(itemRepo.find).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, isAvailable: true },
      });
      expect(result.categories).toHaveLength(1);
      expect(result.categories[0].id).toBe('cat-1');
      expect(result.categories[0].items).toHaveLength(2);
    });

    it('excludes categories that have no available items (variant A from BNP-30)', async () => {
      const cats = [
        { id: 'cat-1', tenantId: TENANT_ID, name: 'Drinks', sortOrder: 0, isVisible: true },
        { id: 'cat-2', tenantId: TENANT_ID, name: 'Desserts', sortOrder: 1, isVisible: true },
      ];
      tenantRepo.findOne.mockResolvedValue(tenant);
      categoryRepo.find.mockResolvedValue(cats);
      itemRepo.find.mockResolvedValue([
        { id: 'i-1', tenantId: TENANT_ID, categoryId: 'cat-1', name: 'Tea', price: 2.5, isAvailable: true },
      ]);

      const result = await service.getPublicMenu(TENANT_SLUG);

      expect(result.categories).toHaveLength(1);
      expect(result.categories[0].id).toBe('cat-1');
    });

    it('returns empty categories array when all items are unavailable', async () => {
      tenantRepo.findOne.mockResolvedValue(tenant);
      categoryRepo.find.mockResolvedValue([
        { id: 'cat-1', tenantId: TENANT_ID, name: 'Drinks', sortOrder: 0, isVisible: true },
      ]);
      itemRepo.find.mockResolvedValue([]);

      const result = await service.getPublicMenu(TENANT_SLUG);

      expect(result.categories).toHaveLength(0);
    });

    it('returns tenant name and slug in response', async () => {
      tenantRepo.findOne.mockResolvedValue(tenant);
      categoryRepo.find.mockResolvedValue([]);
      itemRepo.find.mockResolvedValue([]);

      const result = await service.getPublicMenu(TENANT_SLUG);

      expect(result.name).toBe('My Cafe');
      expect(result.slug).toBe(TENANT_SLUG);
      expect(result.tenantId).toBe(TENANT_ID);
    });

    it('groups items under their respective categories', async () => {
      tenantRepo.findOne.mockResolvedValue(tenant);
      categoryRepo.find.mockResolvedValue([
        { id: 'cat-1', tenantId: TENANT_ID, name: 'Drinks', sortOrder: 0, isVisible: true },
        { id: 'cat-2', tenantId: TENANT_ID, name: 'Food', sortOrder: 1, isVisible: true },
      ]);
      itemRepo.find.mockResolvedValue([
        { id: 'i-1', tenantId: TENANT_ID, categoryId: 'cat-1', name: 'Tea', price: 2.5, isAvailable: true },
        { id: 'i-2', tenantId: TENANT_ID, categoryId: 'cat-2', name: 'Pasta', price: 8.0, isAvailable: true },
        { id: 'i-3', tenantId: TENANT_ID, categoryId: 'cat-2', name: 'Pizza', price: 10.0, isAvailable: true },
      ]);

      const result = await service.getPublicMenu(TENANT_SLUG);

      expect(result.categories).toHaveLength(2);
      const drinks = result.categories.find(c => c.id === 'cat-1');
      const food = result.categories.find(c => c.id === 'cat-2');
      expect(drinks?.items).toHaveLength(1);
      expect(food?.items).toHaveLength(2);
    });
  });
});
