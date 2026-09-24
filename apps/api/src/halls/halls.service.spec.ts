import { ConflictException, NotFoundException } from '@nestjs/common';
import { TableStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HallsService } from './halls.service';

describe('HallsService', () => {
  let prisma: {
    forTenant: jest.Mock;
    diningArea: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    table: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      createMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let service: HallsService;

  beforeEach(() => {
    prisma = {
      forTenant: jest.fn(),
      diningArea: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      table: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    prisma.forTenant.mockReturnValue(prisma);
    service = new HallsService(prisma as unknown as PrismaService);
  });

  describe('listAreas', () => {
    it('returns dining areas scoped to the tenant ordered by sortOrder', async () => {
      const areas = [{ id: 'a1', name: 'Terrace' }, { id: 'a2', name: 'Main Hall' }];
      prisma.diningArea.findMany.mockResolvedValue(areas);

      const result = await service.listAreas('tenant-1');

      expect(prisma.forTenant).toHaveBeenCalledWith('tenant-1');
      expect(prisma.diningArea.findMany).toHaveBeenCalledWith({
        orderBy: { sortOrder: 'asc' },
      });
      expect(result).toBe(areas);
    });
  });

  describe('createArea', () => {
    it('creates a dining area with the provided name and sortOrder', async () => {
      const area = { id: 'a1', name: 'VIP', sortOrder: 2 };
      prisma.diningArea.create.mockResolvedValue(area);

      const result = await service.createArea('tenant-1', { name: 'VIP', sortOrder: 2 });

      expect(prisma.forTenant).toHaveBeenCalledWith('tenant-1');
      expect(prisma.diningArea.create).toHaveBeenCalledWith({
        data: { tenantId: 'tenant-1', name: 'VIP', sortOrder: 2 },
      });
      expect(result).toBe(area);
    });

    it('defaults sortOrder to 0 when not provided', async () => {
      prisma.diningArea.create.mockResolvedValue({ id: 'a1', name: 'Bar' });

      await service.createArea('tenant-1', { name: 'Bar' });

      expect(prisma.diningArea.create).toHaveBeenCalledWith({
        data: { tenantId: 'tenant-1', name: 'Bar', sortOrder: 0 },
      });
    });
  });

  describe('listTables', () => {
    it('returns tables scoped to the tenant ordered by area and table number', async () => {
      const tables = [{ id: 't1' }, { id: 't2' }];
      prisma.table.findMany.mockResolvedValue(tables);

      const result = await service.listTables('tenant-1');

      expect(prisma.forTenant).toHaveBeenCalledWith('tenant-1');
      expect(prisma.table.findMany).toHaveBeenCalledWith({
        orderBy: [{ areaId: 'asc' }, { tableNumber: 'asc' }],
      });
      expect(result).toBe(tables);
    });
  });

  describe('createTable', () => {
    it('generates a qr_token and creates a table in a tenant-owned area', async () => {
      prisma.diningArea.findFirst.mockResolvedValue({ id: 'area-1' });
      const created = { id: 't1', qrToken: 'some-uuid', tableNumber: 5 };
      prisma.table.create.mockResolvedValue(created);

      const result = await service.createTable('tenant-1', {
        tableNumber: 5,
        areaId: 'area-1',
      });

      expect(prisma.diningArea.findFirst).toHaveBeenCalledWith({
        where: { id: 'area-1' },
        select: { id: true },
      });
      expect(prisma.table.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tableNumber: 5,
            areaId: 'area-1',
            qrToken: expect.any(String),
          }),
        }),
      );
      expect(result).toBe(created);
    });

    it('applies default seatsCount of 1 when not provided', async () => {
      prisma.diningArea.findFirst.mockResolvedValue({ id: 'area-1' });
      prisma.table.create.mockResolvedValue({ id: 't1' });

      await service.createTable('tenant-1', { tableNumber: 1, areaId: 'area-1' });

      expect(prisma.table.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ seatsCount: 1 }),
        }),
      );
    });

    it('rejects creation when area is not found in the tenant', async () => {
      prisma.diningArea.findFirst.mockResolvedValue(null);

      await expect(
        service.createTable('tenant-1', { tableNumber: 1, areaId: 'other-tenant-area' }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.table.create).not.toHaveBeenCalled();
    });
  });

  describe('updateTable', () => {
    it('updates the table when it belongs to the tenant', async () => {
      prisma.table.findFirst.mockResolvedValue({ id: 't1' });
      const updated = { id: 't1', tableNumber: 7 };
      prisma.table.update.mockResolvedValue(updated);

      const result = await service.updateTable('tenant-1', 't1', { tableNumber: 7 });

      expect(prisma.table.findFirst).toHaveBeenCalledWith({
        where: { id: 't1' },
        select: { id: true },
      });
      expect(prisma.table.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id_tenantId: { id: 't1', tenantId: 'tenant-1' } },
          data: { tableNumber: 7 },
        }),
      );
      expect(result).toBe(updated);
    });

    it('throws NotFoundException when table does not belong to the tenant', async () => {
      prisma.table.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTable('tenant-1', 'other-table', { tableNumber: 1 }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.table.update).not.toHaveBeenCalled();
    });

    it('verifies the new area belongs to the tenant before updating the table', async () => {
      prisma.diningArea.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTable('tenant-1', 't1', { areaId: 'foreign-area' }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.table.findFirst).not.toHaveBeenCalled();
      expect(prisma.table.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteTable', () => {
    it('deletes a table with AVAILABLE status', async () => {
      prisma.table.findFirst.mockResolvedValue({ id: 't1', status: TableStatus.AVAILABLE });
      prisma.table.delete.mockResolvedValue({ id: 't1' });

      await service.deleteTable('tenant-1', 't1');

      expect(prisma.table.delete).toHaveBeenCalledWith({
        where: { id_tenantId: { id: 't1', tenantId: 'tenant-1' } },
      });
    });

    it('throws ConflictException when table has OCCUPIED status', async () => {
      prisma.table.findFirst.mockResolvedValue({ id: 't1', status: TableStatus.OCCUPIED });

      await expect(service.deleteTable('tenant-1', 't1')).rejects.toThrow(ConflictException);
      expect(prisma.table.delete).not.toHaveBeenCalled();
    });

    it('throws ConflictException when table has BILL_REQUESTED status', async () => {
      prisma.table.findFirst.mockResolvedValue({ id: 't1', status: TableStatus.BILL_REQUESTED });

      await expect(service.deleteTable('tenant-1', 't1')).rejects.toThrow(ConflictException);
      expect(prisma.table.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when table is not in the tenant', async () => {
      prisma.table.findFirst.mockResolvedValue(null);

      await expect(service.deleteTable('tenant-2', 't1')).rejects.toThrow(NotFoundException);
      expect(prisma.table.delete).not.toHaveBeenCalled();
    });
  });

  describe('bulkCreateTables', () => {
    it('creates the requested number of tables with sequential numbers', async () => {
      prisma.diningArea.findFirst.mockResolvedValue({ id: 'area-1' });
      prisma.table.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 't1', tableNumber: 1, qrToken: 'token-1' },
          { id: 't2', tableNumber: 2, qrToken: 'token-2' },
          { id: 't3', tableNumber: 3, qrToken: 'token-3' },
        ]);
      prisma.table.createMany.mockResolvedValue({ count: 3 });

      const result = await service.bulkCreateTables('tenant-1', {
        areaId: 'area-1',
        startNumber: 1,
        count: 3,
        seatsCount: 4,
      });

      expect(prisma.table.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ tableNumber: 1, seatsCount: 4, qrToken: expect.any(String) }),
            expect.objectContaining({ tableNumber: 2, seatsCount: 4, qrToken: expect.any(String) }),
            expect.objectContaining({ tableNumber: 3, seatsCount: 4, qrToken: expect.any(String) }),
          ]),
        }),
      );
      expect(result).toHaveLength(3);
    });

    it('generates unique qr_tokens for each table in the batch', async () => {
      prisma.diningArea.findFirst.mockResolvedValue({ id: 'area-1' });
      const returnedTables = Array.from({ length: 5 }, (_, i) => ({
        id: `t${i}`,
        tableNumber: i + 1,
        qrToken: `token-${i}`,
      }));
      prisma.table.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(returnedTables);
      prisma.table.createMany.mockResolvedValue({ count: 5 });

      await service.bulkCreateTables('tenant-1', {
        areaId: 'area-1',
        startNumber: 1,
        count: 5,
      });

      const createManyArgs = prisma.table.createMany.mock.calls[0][0] as { data: Array<{ qrToken: string }> };
      const qrTokens = createManyArgs.data.map((t) => t.qrToken);
      expect(new Set(qrTokens).size).toBe(5);
    });

    it('throws ConflictException when any table number already exists in the tenant', async () => {
      prisma.diningArea.findFirst.mockResolvedValue({ id: 'area-1' });
      prisma.table.findMany.mockResolvedValueOnce([{ tableNumber: 3 }]);

      await expect(
        service.bulkCreateTables('tenant-1', {
          areaId: 'area-1',
          startNumber: 1,
          count: 5,
        }),
      ).rejects.toThrow(ConflictException);

      expect(prisma.table.createMany).not.toHaveBeenCalled();
    });

    it('includes conflicting numbers in the ConflictException', async () => {
      prisma.diningArea.findFirst.mockResolvedValue({ id: 'area-1' });
      prisma.table.findMany.mockResolvedValueOnce([{ tableNumber: 3 }, { tableNumber: 5 }]);

      await expect(
        service.bulkCreateTables('tenant-1', {
          areaId: 'area-1',
          startNumber: 1,
          count: 10,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ conflicts: [3, 5] }),
      });
    });

    it('throws NotFoundException when area does not belong to the tenant', async () => {
      prisma.diningArea.findFirst.mockResolvedValue(null);

      await expect(
        service.bulkCreateTables('tenant-1', { areaId: 'foreign-area', startNumber: 1, count: 3 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateTableStatus', () => {
    it('updates the table status', async () => {
      prisma.table.findFirst.mockResolvedValue({ id: 't1' });
      const updated = { id: 't1', status: TableStatus.OCCUPIED };
      prisma.table.update.mockResolvedValue(updated);

      const result = await service.updateTableStatus('tenant-1', 't1', TableStatus.OCCUPIED);

      expect(prisma.table.findFirst).toHaveBeenCalledWith({
        where: { id: 't1' },
        select: { id: true },
      });
      expect(prisma.table.update).toHaveBeenCalledWith({
        where: { id_tenantId: { id: 't1', tenantId: 'tenant-1' } },
        data: { status: TableStatus.OCCUPIED },
      });
      expect(result).toBe(updated);
    });

    it('throws NotFoundException when table is not in the tenant', async () => {
      prisma.table.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTableStatus('tenant-2', 't1', TableStatus.AVAILABLE),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.table.update).not.toHaveBeenCalled();
    });
  });
});
