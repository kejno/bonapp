import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { MenuItemService } from './menu-item.service.js';
import { MenuCategory } from './entities/menu-category.entity.js';
import { MenuItem } from './entities/menu-item.entity.js';

const mockRepo = () => ({
  find: vi.fn(),
  findOne: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
});

const TENANT = 'tenant-uuid';
const CAT_ID = 'cat-uuid';

describe('MenuItemService', () => {
  let service: MenuItemService;
  let itemRepo: ReturnType<typeof mockRepo>;
  let categoryRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuItemService,
        { provide: getRepositoryToken(MenuItem), useFactory: mockRepo },
        { provide: getRepositoryToken(MenuCategory), useFactory: mockRepo },
      ],
    }).compile();

    service = module.get(MenuItemService);
    itemRepo = module.get(getRepositoryToken(MenuItem));
    categoryRepo = module.get(getRepositoryToken(MenuCategory));
  });

  afterEach(() => vi.clearAllMocks());

  describe('getItems', () => {
    it('returns all items for tenant without categoryId filter', async () => {
      const items = [
        { id: '1', tenantId: TENANT, categoryId: CAT_ID, name: 'Tea', price: 2.5 },
        { id: '2', tenantId: TENANT, categoryId: CAT_ID, name: 'Coffee', price: 3.0 },
      ];
      itemRepo.find.mockResolvedValue(items);

      const result = await service.getItems(TENANT);

      expect(itemRepo.find).toHaveBeenCalledWith({ where: { tenantId: TENANT } });
      expect(result).toEqual(items);
    });

    it('filters by categoryId when provided', async () => {
      const items = [{ id: '1', tenantId: TENANT, categoryId: CAT_ID, name: 'Tea', price: 2.5 }];
      itemRepo.find.mockResolvedValue(items);

      const result = await service.getItems(TENANT, CAT_ID);

      expect(itemRepo.find).toHaveBeenCalledWith({ where: { tenantId: TENANT, categoryId: CAT_ID } });
      expect(result).toEqual(items);
    });

    it('returns empty array when no items exist', async () => {
      itemRepo.find.mockResolvedValue([]);
      const result = await service.getItems(TENANT);
      expect(result).toEqual([]);
    });
  });

  describe('createItem', () => {
    const dto = { categoryId: CAT_ID, name: 'Tea', price: 2.5 };
    const category = { id: CAT_ID, tenantId: TENANT, name: 'Drinks' };

    it('creates item when category belongs to tenant', async () => {
      const created = { id: 'item-uuid', tenantId: TENANT, ...dto };
      categoryRepo.findOne.mockResolvedValue(category);
      itemRepo.create.mockReturnValue(created);
      itemRepo.save.mockResolvedValue(created);

      const result = await service.createItem(TENANT, dto);

      expect(categoryRepo.findOne).toHaveBeenCalledWith({ where: { id: CAT_ID, tenantId: TENANT } });
      expect(itemRepo.create).toHaveBeenCalledWith({ ...dto, tenantId: TENANT });
      expect(result).toEqual(created);
    });

    it('throws NotFoundException when category not found for this tenant', async () => {
      categoryRepo.findOne.mockResolvedValue(null);

      await expect(service.createItem(TENANT, dto)).rejects.toThrow(NotFoundException);
      expect(itemRepo.create).not.toHaveBeenCalled();
    });

    it('creates multiple items independently', async () => {
      categoryRepo.findOne.mockResolvedValue(category);
      const item1 = { id: '1', tenantId: TENANT, categoryId: CAT_ID, name: 'Tea', price: 2.5 };
      const item2 = { id: '2', tenantId: TENANT, categoryId: CAT_ID, name: 'Coffee', price: 3.0 };
      itemRepo.create.mockReturnValueOnce(item1).mockReturnValueOnce(item2);
      itemRepo.save.mockResolvedValueOnce(item1).mockResolvedValueOnce(item2);

      await service.createItem(TENANT, { categoryId: CAT_ID, name: 'Tea', price: 2.5 });
      await service.createItem(TENANT, { categoryId: CAT_ID, name: 'Coffee', price: 3.0 });

      expect(itemRepo.save).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateItem', () => {
    const existing = { id: 'item-uuid', tenantId: TENANT, categoryId: CAT_ID, name: 'Tea', price: 2.5, isAvailable: true };

    it('updates item name and price', async () => {
      itemRepo.findOne.mockResolvedValue(existing);
      itemRepo.save.mockResolvedValue({ ...existing, name: 'Green Tea', price: 3.0 });

      const result = await service.updateItem(TENANT, 'item-uuid', { name: 'Green Tea', price: 3.0 });

      expect(itemRepo.findOne).toHaveBeenCalledWith({ where: { id: 'item-uuid', tenantId: TENANT } });
      expect(result.name).toBe('Green Tea');
    });

    it('validates new categoryId belongs to tenant when category changes', async () => {
      const newCatId = 'new-cat-uuid';
      itemRepo.findOne.mockResolvedValue(existing);
      categoryRepo.findOne.mockResolvedValue({ id: newCatId, tenantId: TENANT });
      itemRepo.save.mockResolvedValue({ ...existing, categoryId: newCatId });

      await service.updateItem(TENANT, 'item-uuid', { categoryId: newCatId });

      expect(categoryRepo.findOne).toHaveBeenCalledWith({ where: { id: newCatId, tenantId: TENANT } });
    });

    it('throws NotFoundException when new categoryId does not belong to tenant', async () => {
      itemRepo.findOne.mockResolvedValue(existing);
      categoryRepo.findOne.mockResolvedValue(null);

      await expect(service.updateItem(TENANT, 'item-uuid', { categoryId: 'other-cat' })).rejects.toThrow(NotFoundException);
    });

    it('does not validate categoryId when it stays the same', async () => {
      itemRepo.findOne.mockResolvedValue(existing);
      itemRepo.save.mockResolvedValue({ ...existing, isAvailable: false });

      await service.updateItem(TENANT, 'item-uuid', { isAvailable: false });

      expect(categoryRepo.findOne).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when item not found', async () => {
      itemRepo.findOne.mockResolvedValue(null);

      await expect(service.updateItem(TENANT, 'missing', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteItem', () => {
    const existing = { id: 'item-uuid', tenantId: TENANT, categoryId: CAT_ID, name: 'Tea', price: 2.5 };

    it('deletes item', async () => {
      itemRepo.findOne.mockResolvedValue(existing);
      itemRepo.remove.mockResolvedValue(undefined);

      await service.deleteItem(TENANT, 'item-uuid');

      expect(itemRepo.findOne).toHaveBeenCalledWith({ where: { id: 'item-uuid', tenantId: TENANT } });
      expect(itemRepo.remove).toHaveBeenCalledWith(existing);
    });

    it('throws NotFoundException when item not found', async () => {
      itemRepo.findOne.mockResolvedValue(null);

      await expect(service.deleteItem(TENANT, 'missing')).rejects.toThrow(NotFoundException);
      expect(itemRepo.remove).not.toHaveBeenCalled();
    });
  });
});
