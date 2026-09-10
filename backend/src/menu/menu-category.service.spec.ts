import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { MenuCategoryService } from './menu-category.service.js';
import { MenuCategory } from './entities/menu-category.entity.js';
import { MenuItem } from './entities/menu-item.entity.js';

const mockRepo = () => ({
  find: vi.fn(),
  findOne: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  count: vi.fn(),
});

const TENANT = 'tenant-uuid';

describe('MenuCategoryService', () => {
  let service: MenuCategoryService;
  let categoryRepo: ReturnType<typeof mockRepo>;
  let itemRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuCategoryService,
        { provide: getRepositoryToken(MenuCategory), useFactory: mockRepo },
        { provide: getRepositoryToken(MenuItem), useFactory: mockRepo },
      ],
    }).compile();

    service = module.get(MenuCategoryService);
    categoryRepo = module.get(getRepositoryToken(MenuCategory));
    itemRepo = module.get(getRepositoryToken(MenuItem));
  });

  afterEach(() => vi.clearAllMocks());

  describe('getCategories', () => {
    it('returns all categories for the tenant ordered by sortOrder', async () => {
      const cats = [
        { id: '1', tenantId: TENANT, name: 'Drinks', sortOrder: 0, isVisible: true },
        { id: '2', tenantId: TENANT, name: 'Food', sortOrder: 1, isVisible: true },
      ];
      categoryRepo.find.mockResolvedValue(cats);

      const result = await service.getCategories(TENANT);

      expect(categoryRepo.find).toHaveBeenCalledWith({ where: { tenantId: TENANT }, order: { sortOrder: 'ASC' } });
      expect(result).toEqual(cats);
    });

    it('returns empty array when tenant has no categories', async () => {
      categoryRepo.find.mockResolvedValue([]);
      const result = await service.getCategories(TENANT);
      expect(result).toEqual([]);
    });
  });

  describe('createCategory', () => {
    it('creates category with tenantId merged', async () => {
      const dto = { name: 'Drinks', sortOrder: 0, isVisible: true };
      const created = { id: 'cat-uuid', tenantId: TENANT, ...dto };
      categoryRepo.create.mockReturnValue(created);
      categoryRepo.save.mockResolvedValue(created);

      const result = await service.createCategory(TENANT, dto);

      expect(categoryRepo.create).toHaveBeenCalledWith({ ...dto, tenantId: TENANT });
      expect(categoryRepo.save).toHaveBeenCalledWith(created);
      expect(result).toEqual(created);
    });

    it('creates multiple categories independently (no shared state)', async () => {
      const dtoA = { name: 'A' };
      const dtoB = { name: 'B' };
      const catA = { id: '1', tenantId: TENANT, name: 'A', sortOrder: 0, isVisible: true };
      const catB = { id: '2', tenantId: TENANT, name: 'B', sortOrder: 0, isVisible: true };

      categoryRepo.create.mockReturnValueOnce(catA).mockReturnValueOnce(catB);
      categoryRepo.save.mockResolvedValueOnce(catA).mockResolvedValueOnce(catB);

      await service.createCategory(TENANT, dtoA);
      await service.createCategory(TENANT, dtoB);

      expect(categoryRepo.create).toHaveBeenNthCalledWith(1, { name: 'A', tenantId: TENANT });
      expect(categoryRepo.create).toHaveBeenNthCalledWith(2, { name: 'B', tenantId: TENANT });
    });
  });

  describe('updateCategory', () => {
    const existing = { id: 'cat-uuid', tenantId: TENANT, name: 'Drinks', sortOrder: 0, isVisible: true };

    it('updates and returns category', async () => {
      categoryRepo.findOne.mockResolvedValue(existing);
      categoryRepo.save.mockResolvedValue({ ...existing, name: 'Beverages' });

      const result = await service.updateCategory(TENANT, 'cat-uuid', { name: 'Beverages' });

      expect(categoryRepo.findOne).toHaveBeenCalledWith({ where: { id: 'cat-uuid', tenantId: TENANT } });
      expect(result.name).toBe('Beverages');
    });

    it('throws NotFoundException when category not found', async () => {
      categoryRepo.findOne.mockResolvedValue(null);

      await expect(service.updateCategory(TENANT, 'missing', {})).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for id belonging to a different tenant', async () => {
      categoryRepo.findOne.mockResolvedValue(null);

      await expect(service.updateCategory('other-tenant', 'cat-uuid', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteCategory', () => {
    const existing = { id: 'cat-uuid', tenantId: TENANT, name: 'Drinks', sortOrder: 0, isVisible: true };

    it('deletes category when no items exist', async () => {
      categoryRepo.findOne.mockResolvedValue(existing);
      itemRepo.count.mockResolvedValue(0);
      categoryRepo.remove.mockResolvedValue(undefined);

      await service.deleteCategory(TENANT, 'cat-uuid');

      expect(itemRepo.count).toHaveBeenCalledWith({ where: { categoryId: 'cat-uuid', tenantId: TENANT } });
      expect(categoryRepo.remove).toHaveBeenCalledWith(existing);
    });

    it('throws NotFoundException when category not found', async () => {
      categoryRepo.findOne.mockResolvedValue(null);

      await expect(service.deleteCategory(TENANT, 'missing')).rejects.toThrow(NotFoundException);
      expect(itemRepo.count).not.toHaveBeenCalled();
    });

    it('throws ConflictException when category has items', async () => {
      categoryRepo.findOne.mockResolvedValue(existing);
      itemRepo.count.mockResolvedValue(2);

      await expect(service.deleteCategory(TENANT, 'cat-uuid')).rejects.toThrow(ConflictException);
      expect(categoryRepo.remove).not.toHaveBeenCalled();
    });
  });
});
