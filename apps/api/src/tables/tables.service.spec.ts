/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TablesService } from './tables.service';

describe('TablesService', () => {
  const tenantId = 'tenant-1';
  const areaId = 'area-1';
  let prisma: {
    area: { findFirst: jest.Mock };
    table: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    order: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: TablesService;

  beforeEach(() => {
    prisma = {
      area: { findFirst: jest.fn().mockResolvedValue({ id: areaId }) },
      table: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      order: { count: jest.fn() },
      $transaction: jest.fn(),
    };
    service = new TablesService(prisma as never);
  });

  it('creates a table with an automatically generated QR token scoped to the tenant', async () => {
    prisma.table.create.mockImplementation(async ({ data }) => data);

    const result = await service.create(tenantId, {
      tableNumber: 7,
      label: 'Window',
      seatsCount: 4,
      areaId,
    });

    expect(result).toMatchObject({ tenantId, tableNumber: 7, areaId });
    expect(result.qrToken).toEqual(expect.any(String));
    expect(prisma.table.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId, tableNumber: 7, areaId }),
    });
  });

  it('does not create a table in another tenant area', async () => {
    prisma.area.findFirst.mockResolvedValue(null);

    await expect(
      service.create(tenantId, { tableNumber: 7, seatsCount: 4, areaId }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a whole bulk range with unique QR tokens in one transaction', async () => {
    const tx = {
      table: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const result = await service.bulkCreate(tenantId, {
      areaId,
      startNumber: 10,
      count: 2,
      seatsCount: 4,
    });

    expect(result).toEqual({ count: 2 });
    expect(tx.table.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          tableNumber: 10,
          tenantId,
          areaId,
          qrToken: expect.any(String),
        }),
        expect.objectContaining({
          tableNumber: 11,
          tenantId,
          areaId,
          qrToken: expect.any(String),
        }),
      ]),
    });
    const data = tx.table.createMany.mock.calls[0][0].data;
    expect(data[0].qrToken).not.toBe(data[1].qrToken);
  });

  it('rejects the entire bulk operation with conflicting numbers', async () => {
    const tx = {
      table: {
        findMany: jest.fn().mockResolvedValue([{ tableNumber: 11 }]),
        createMany: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      service.bulkCreate(tenantId, {
        areaId,
        startNumber: 10,
        count: 2,
        seatsCount: 4,
      }),
    ).rejects.toEqual(
      new ConflictException({
        message: 'Table numbers already exist',
        tableNumbers: [11],
      }),
    );
    expect(tx.table.createMany).not.toHaveBeenCalled();
  });

  it('prevents deleting a table with an active order', async () => {
    prisma.table.findFirst.mockResolvedValue({ id: 'table-1' });
    prisma.order.count.mockResolvedValue(1);

    await expect(service.remove(tenantId, 'table-1')).rejects.toEqual(
      new ConflictException(
        'Table cannot be deleted while it has an active order',
      ),
    );
    expect(prisma.table.delete).not.toHaveBeenCalled();
  });

  it('updates only the status of a table belonging to the tenant', async () => {
    prisma.table.findFirst.mockResolvedValue({ id: 'table-1' });
    prisma.table.update.mockResolvedValue({
      id: 'table-1',
      status: 'OCCUPIED',
    });

    await expect(
      service.updateStatus(tenantId, 'table-1', 'OCCUPIED'),
    ).resolves.toMatchObject({ status: 'OCCUPIED' });
    expect(prisma.table.update).toHaveBeenCalledWith({
      where: { id: 'table-1' },
      data: { status: 'OCCUPIED' },
    });
  });
});
