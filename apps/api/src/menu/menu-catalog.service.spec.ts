import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { MenuCatalogService } from './menu-catalog.service';

const CACHE_KEY = 'menu:tenant:tenant-1';

describe('MenuCatalogService', () => {
  let prisma: {
    forTenant: jest.Mock;
    transactionForTenant: jest.Mock;
    menuCategory: {
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
    menuItem: {
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
  };
  let cache: { del: jest.Mock };
  let storage: { getPresignedUploadUrl: jest.Mock };
  let service: MenuCatalogService;

  beforeEach(() => {
    prisma = {
      forTenant: jest.fn(),
      transactionForTenant: jest.fn(),
      menuCategory: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      menuItem: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };
    prisma.forTenant.mockReturnValue(prisma);
    prisma.transactionForTenant.mockImplementation((_tenantId: string, callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));
    cache = { del: jest.fn() };
    storage = { getPresignedUploadUrl: jest.fn() };
    service = new MenuCatalogService(
      prisma as unknown as PrismaService,
      cache as unknown as CacheService,
      storage as unknown as StorageService,
    );
  });

  describe('listCategories', () => {
    it('returns categories ordered by sortOrder then id', async () => {
      const cats = [
        { id: 'a', sortOrder: 1, isActive: true },
        { id: 'b', sortOrder: 2, isActive: false },
      ];
      prisma.menuCategory.findMany.mockResolvedValue(cats);

      const result = await service.listCategories('tenant-1');

      expect(prisma.forTenant).toHaveBeenCalledWith('tenant-1');
      expect(prisma.menuCategory.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
      expect(result).toEqual([
        { id: 'a', sortOrder: 1, isVisible: true },
        { id: 'b', sortOrder: 2, isVisible: false },
      ]);
      expect(result[0]).not.toHaveProperty('isActive');
    });
  });

  describe('createCategory', () => {
    it('creates a category and invalidates the menu cache', async () => {
      const created = { id: 'cat-1', name: 'Drinks', sortOrder: 1, isActive: true, posCategoryId: null };
      prisma.menuCategory.create.mockResolvedValue(created);

      const result = await service.createCategory('tenant-1', {
        name: 'Drinks',
        sortOrder: 1,
        isVisible: true,
      });

      expect(prisma.menuCategory.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          name: 'Drinks',
          sortOrder: 1,
          isActive: true,
          posCategoryId: undefined,
        },
      });
      expect(cache.del).toHaveBeenCalledWith(CACHE_KEY);
      expect(result).toEqual({
        id: 'cat-1',
        name: 'Drinks',
        sortOrder: 1,
        posCategoryId: null,
        isVisible: true,
      });
      expect(result).not.toHaveProperty('isActive');
    });

    it('rejects a name that is empty after trimming', async () => {
      await expect(
        service.createCategory('tenant-1', { name: '   ', sortOrder: 0, isVisible: true }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.menuCategory.create).not.toHaveBeenCalled();
    });

    it('rejects a name longer than 255 characters', async () => {
      await expect(
        service.createCategory('tenant-1', { name: 'x'.repeat(256), sortOrder: 0, isVisible: true }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.menuCategory.create).not.toHaveBeenCalled();
    });

    it('translates a P2002 Prisma error on pos_category_id to ConflictException', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['tenant_id', 'pos_category_id'] },
      });
      prisma.menuCategory.create.mockRejectedValue(prismaError);

      await expect(
        service.createCategory('tenant-1', { name: 'Food', sortOrder: 1, isVisible: true, posCategoryId: 'dup' }),
      ).rejects.toThrow(ConflictException);
      expect(cache.del).not.toHaveBeenCalled();
    });
  });

  describe('updateCategory', () => {
    it('updates a category and invalidates the menu cache', async () => {
      const updated = { id: 'cat-1', name: 'Updated', isActive: false };
      prisma.menuCategory.update.mockResolvedValue(updated);

      const result = await service.updateCategory('tenant-1', 'cat-1', { name: 'Updated' });

      expect(prisma.menuCategory.update).toHaveBeenCalledWith({
        where: { tenantId_id: { tenantId: 'tenant-1', id: 'cat-1' } },
        data: { name: 'Updated' },
      });
      expect(cache.del).toHaveBeenCalledWith(CACHE_KEY);
      expect(result).toEqual({ id: 'cat-1', name: 'Updated', isVisible: false });
      expect(result).not.toHaveProperty('isActive');
    });

    it('maps isVisible to isActive in the update data', async () => {
      prisma.menuCategory.update.mockResolvedValue({ id: 'cat-1' });

      await service.updateCategory('tenant-1', 'cat-1', { isVisible: false });

      expect(prisma.menuCategory.update).toHaveBeenCalledWith({
        where: { tenantId_id: { tenantId: 'tenant-1', id: 'cat-1' } },
        data: { isActive: false },
      });
    });

    it('rejects an empty update without writing to the database or invalidating the cache', async () => {
      await expect(service.updateCategory('tenant-1', 'cat-1', {})).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.menuCategory.update).not.toHaveBeenCalled();
      expect(cache.del).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the category does not belong to the tenant', async () => {
      prisma.menuCategory.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '5.0.0',
        }),
      );

      await expect(
        service.updateCategory('tenant-1', 'unknown', { name: 'Renamed' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteCategory', () => {
    it('deletes a category and invalidates the menu cache', async () => {
      prisma.menuCategory.delete.mockResolvedValue({ id: 'cat-1' });

      await service.deleteCategory('tenant-1', 'cat-1');

      expect(prisma.menuCategory.delete).toHaveBeenCalledWith({
        where: { tenantId_id: { tenantId: 'tenant-1', id: 'cat-1' } },
      });
      expect(cache.del).toHaveBeenCalledWith(CACHE_KEY);
    });

    it('throws NotFoundException when the category does not exist', async () => {
      prisma.menuCategory.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '5.0.0',
        }),
      );

      await expect(service.deleteCategory('tenant-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listItems', () => {
    it('returns all items with category-based ordering when no filters are given', async () => {
      const items = [
        { id: 'item-1', name: 'Latte', priceByn: 5.5 },
        { id: 'item-2', name: 'Tea', priceByn: 0 },
      ];
      prisma.menuItem.findMany.mockResolvedValue(items);

      const result = await service.listItems('tenant-1', {});

      expect(prisma.menuItem.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        orderBy: [
          { category: { sortOrder: 'asc' } },
          { sortOrder: 'asc' },
          { id: 'asc' },
        ],
      });
      expect(result).toEqual([
        { id: 'item-1', name: 'Latte', price: 550 },
        { id: 'item-2', name: 'Tea', price: 0 },
      ]);
      expect(result[0]).not.toHaveProperty('priceByn');
    });

    it('applies categoryId, isActive and isInStopList filters', async () => {
      prisma.menuItem.findMany.mockResolvedValue([]);

      await service.listItems('tenant-1', {
        categoryId: 'cat-1',
        isActive: true,
        isInStopList: false,
      });

      expect(prisma.menuItem.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          categoryId: 'cat-1',
          isActive: true,
          isInStopList: false,
        },
        orderBy: [
          { category: { sortOrder: 'asc' } },
          { sortOrder: 'asc' },
          { id: 'asc' },
        ],
      });
    });

    it('applies multiple filters simultaneously', async () => {
      prisma.menuItem.findMany.mockResolvedValue([]);

      await service.listItems('tenant-1', { isActive: false, isInStopList: true });

      expect(prisma.menuItem.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', isActive: false, isInStopList: true },
        orderBy: [
          { category: { sortOrder: 'asc' } },
          { sortOrder: 'asc' },
          { id: 'asc' },
        ],
      });
    });

    it('reorders every item in a category and invalidates menu cache', async () => {
      const update = jest.fn().mockResolvedValue({});
      prisma.menuItem.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      prisma.transactionForTenant.mockImplementation((_tenantId: string, callback: (tx: { menuItem: { update: jest.Mock } }) => Promise<unknown>) => callback({ menuItem: { update } }));

      await service.reorderItems('tenant-1', { categoryId: 'cat-1', itemIds: ['b', 'a'] });

      expect(update).toHaveBeenCalledWith({ where: { tenantId_id: { tenantId: 'tenant-1', id: 'b' } }, data: { sortOrder: 0 } });
      expect(update).toHaveBeenCalledWith({ where: { tenantId_id: { tenantId: 'tenant-1', id: 'a' } }, data: { sortOrder: 1 } });
      expect(cache.del).toHaveBeenCalledWith(CACHE_KEY);
    });

    it('rejects incomplete or duplicate order without updating items', async () => {
      prisma.menuItem.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

      await expect(service.reorderItems('tenant-1', { categoryId: 'cat-1', itemIds: ['a', 'a'] })).rejects.toThrow(BadRequestException);
      expect(prisma.transactionForTenant).not.toHaveBeenCalled();
    });
  });

  describe('createItem', () => {
    it('assigns the next category sort order while creating the item', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'item-3', name: 'Latte', priceByn: 5.5 });
      prisma.transactionForTenant.mockImplementation((_tenantId: string, callback: (tx: { menuItem: { findMany: jest.Mock; create: jest.Mock } }) => Promise<unknown>) => callback({
        menuItem: {
          findMany: jest.fn().mockResolvedValue([{ sortOrder: 0 }, { sortOrder: 4 }]),
          create,
        },
      }));

      await service.createItem('tenant-1', { name: 'Latte', categoryId: 'cat-1', price: 550 });

      expect(create).toHaveBeenCalledWith({ data: {
        tenantId: 'tenant-1', name: 'Latte', categoryId: 'cat-1', priceByn: 5.5,
        description: undefined, imageUrl: undefined, sortOrder: 5,
      } });
    });

    it('creates an item and invalidates the menu cache', async () => {
      const created = { id: 'item-1', name: 'Latte', priceByn: 5.5 };
      const create = jest.fn().mockResolvedValue(created);
      prisma.transactionForTenant.mockImplementation((_tenantId: string, callback: (tx: { menuItem: { findMany: jest.Mock; create: jest.Mock } }) => Promise<unknown>) => callback({
        menuItem: { findMany: jest.fn().mockResolvedValue([]), create },
      }));

      const result = await service.createItem('tenant-1', {
        name: 'Latte',
        categoryId: 'cat-1',
        price: 550,
      });

      expect(create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          name: 'Latte',
          categoryId: 'cat-1',
          priceByn: 5.5,
          description: undefined,
          imageUrl: undefined,
          sortOrder: 0,
        },
      });
      expect(cache.del).toHaveBeenCalledWith(CACHE_KEY);
      expect(result).toEqual({ id: 'item-1', name: 'Latte', price: 550 });
      expect(result).not.toHaveProperty('priceByn');
    });

    it('rejects an empty name', async () => {
      await expect(
        service.createItem('tenant-1', { name: '', categoryId: 'cat-1', price: 100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a name longer than 255 characters', async () => {
      await expect(
        service.createItem('tenant-1', { name: 'a'.repeat(256), categoryId: 'cat-1', price: 100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a negative price', async () => {
      await expect(
        service.createItem('tenant-1', { name: 'Latte', categoryId: 'cat-1', price: -1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a non-integer price', async () => {
      await expect(
        service.createItem('tenant-1', { name: 'Latte', categoryId: 'cat-1', price: 5.5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts price of 0', async () => {
      prisma.menuItem.create.mockResolvedValue({ id: 'item-1' });

      await service.createItem('tenant-1', { name: 'Water', categoryId: 'cat-1', price: 0 });

      expect(prisma.menuItem.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          name: 'Water',
          categoryId: 'cat-1',
          priceByn: 0,
          description: undefined,
          imageUrl: undefined,
          sortOrder: 0,
        },
      });
    });

    it('maps description and imageUrl to the DB record', async () => {
      prisma.menuItem.create.mockResolvedValue({ id: 'item-1' });

      await service.createItem('tenant-1', {
        name: 'Cappuccino',
        categoryId: 'cat-1',
        price: 400,
        description: 'Classic',
        imageUrl: 'https://cdn.example.com/cap.jpg',
      });

      expect(prisma.menuItem.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          name: 'Cappuccino',
          categoryId: 'cat-1',
          priceByn: 4,
          description: 'Classic',
          imageUrl: 'https://cdn.example.com/cap.jpg',
          sortOrder: 0,
        },
      });
    });

    it('throws NotFoundException when category does not exist', async () => {
      prisma.menuItem.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
          code: 'P2003',
          clientVersion: '5.0.0',
          meta: { field_name: 'category_id' },
        }),
      );

      await expect(
        service.createItem('tenant-1', { name: 'Espresso', categoryId: 'no-such-cat', price: 300 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateItem', () => {
    it('updates an item and invalidates the menu cache', async () => {
      const updated = { id: 'item-1', name: 'Flat White', priceByn: 5.5 };
      prisma.menuItem.update.mockResolvedValue(updated);

      const result = await service.updateItem('tenant-1', 'item-1', { name: 'Flat White' });

      expect(prisma.menuItem.update).toHaveBeenCalledWith({
        where: { tenantId_id: { tenantId: 'tenant-1', id: 'item-1' } },
        data: { name: 'Flat White' },
      });
      expect(cache.del).toHaveBeenCalledWith(CACHE_KEY);
      expect(result).toEqual({ id: 'item-1', name: 'Flat White', price: 550 });
      expect(result).not.toHaveProperty('priceByn');
    });

    it('converts price in minor units to priceByn decimal', async () => {
      prisma.menuItem.update.mockResolvedValue({ id: 'item-1' });

      await service.updateItem('tenant-1', 'item-1', { price: 1250 });

      expect(prisma.menuItem.update).toHaveBeenCalledWith({
        where: { tenantId_id: { tenantId: 'tenant-1', id: 'item-1' } },
        data: { priceByn: 12.5 },
      });
    });

    it('rejects an empty update without writing to the database or invalidating the cache', async () => {
      await expect(service.updateItem('tenant-1', 'item-1', {})).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.menuItem.update).not.toHaveBeenCalled();
      expect(cache.del).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the item does not belong to the tenant', async () => {
      prisma.menuItem.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '5.0.0',
        }),
      );

      await expect(
        service.updateItem('tenant-1', 'unknown', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when moving an item to a category that does not exist', async () => {
      prisma.menuItem.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
          code: 'P2003',
          clientVersion: '5.0.0',
          meta: { field_name: 'category_id' },
        }),
      );

      await expect(
        service.updateItem('tenant-1', 'item-1', { categoryId: 'missing-category' }),
      ).rejects.toThrow(NotFoundException);
      expect(cache.del).not.toHaveBeenCalled();
    });
  });

  describe('deleteItem', () => {
    it('deletes an item and invalidates the menu cache', async () => {
      prisma.menuItem.delete.mockResolvedValue({ id: 'item-1' });

      await service.deleteItem('tenant-1', 'item-1');

      expect(prisma.menuItem.delete).toHaveBeenCalledWith({
        where: { tenantId_id: { tenantId: 'tenant-1', id: 'item-1' } },
      });
      expect(cache.del).toHaveBeenCalledWith(CACHE_KEY);
    });

    it('throws NotFoundException when the item does not exist', async () => {
      prisma.menuItem.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '5.0.0',
        }),
      );

      await expect(service.deleteItem('tenant-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('presignMenuItemUpload', () => {
    it('returns uploadUrl and imageUrl for a valid content type', async () => {
      storage.getPresignedUploadUrl.mockResolvedValue({
        uploadUrl: 'https://s3.example.com/presigned',
        uploadFields: { key: 'tenants/tenant-1/menu/uuid.jpg' },
        publicUrl: 'https://cdn.example.com/tenants/tenant-1/menu/uuid.jpg',
      });

      const result = await service.presignMenuItemUpload('tenant-1', 'image/jpeg');

      expect(storage.getPresignedUploadUrl).toHaveBeenCalledWith(
        expect.stringMatching(/^tenants\/tenant-1\/menu\/.+\.jpg$/),
        'image/jpeg',
      );
      expect(result).toEqual({
        uploadUrl: 'https://s3.example.com/presigned',
        uploadFields: { key: 'tenants/tenant-1/menu/uuid.jpg' },
        imageUrl: 'https://cdn.example.com/tenants/tenant-1/menu/uuid.jpg',
      });
    });

    it('generates distinct keys for each call', async () => {
      storage.getPresignedUploadUrl
        .mockResolvedValueOnce({ uploadUrl: 'url-1', uploadFields: {}, publicUrl: 'pub-1' })
        .mockResolvedValueOnce({ uploadUrl: 'url-2', uploadFields: {}, publicUrl: 'pub-2' });

      await service.presignMenuItemUpload('tenant-1', 'image/png');
      await service.presignMenuItemUpload('tenant-1', 'image/png');

      const [key1] = storage.getPresignedUploadUrl.mock.calls[0] as [string];
      const [key2] = storage.getPresignedUploadUrl.mock.calls[1] as [string];
      expect(key1).not.toEqual(key2);
    });

    it('rejects an unsupported content type', async () => {
      await expect(
        service.presignMenuItemUpload('tenant-1', 'image/gif'),
      ).rejects.toThrow(BadRequestException);
      expect(storage.getPresignedUploadUrl).not.toHaveBeenCalled();
    });
  });
});
