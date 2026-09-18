import { ConflictException } from '@nestjs/common';
import { TablesService } from './tables.service';

describe('TablesService', () => {
  const tenantId = 'tenant-1';
  const zoneId = 'zone-1';
  const prisma = {
    zone: { findFirst: jest.fn() },
    table: { findMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('creates every table in a range with a unique token and HTTPS guest URL', async () => {
    let createdRows: Array<{
      tenantId: string;
      zoneId: string;
      number: number;
      seats: number;
      qrToken: string;
    }> = [];
    prisma.zone.findFirst.mockResolvedValue({ id: zoneId });
    prisma.table.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: 'table-1', number: 1, seats: 4, qrToken: 'token-1', zoneId },
      { id: 'table-2', number: 2, seats: 4, qrToken: 'token-2', zoneId },
      { id: 'table-3', number: 3, seats: 4, qrToken: 'token-3', zoneId },
      { id: 'table-4', number: 4, seats: 4, qrToken: 'token-4', zoneId },
      { id: 'table-5', number: 5, seats: 4, qrToken: 'token-5', zoneId },
    ]);
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
    prisma.table.createMany.mockImplementation(
      ({ data }: { data: typeof createdRows }) => {
        createdRows = data;
        return Promise.resolve({ count: data.length });
      },
    );

    const service = new TablesService(
      prisma as never,
      'https://guest.example.com',
    );
    const tables = await service.bulkCreate({
      tenantId,
      zoneId,
      seats: 4,
      fromNumber: 1,
      toNumber: 5,
    });

    expect(createdRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tenantId, zoneId, number: 1, seats: 4 }),
        expect.objectContaining({ tenantId, zoneId, number: 5, seats: 4 }),
      ]),
    );
    expect(new Set(createdRows.map((row) => row.qrToken)).size).toBe(5);
    expect(tables).toHaveLength(5);
    expect(new Set(tables.map((table) => table.qrToken)).size).toBe(5);
    expect(tables.map((table) => table.qrUrl)).toEqual([
      'https://guest.example.com/q/token-1',
      'https://guest.example.com/q/token-2',
      'https://guest.example.com/q/token-3',
      'https://guest.example.com/q/token-4',
      'https://guest.example.com/q/token-5',
    ]);
  });

  it('does not create any tables when a number already exists in another zone', async () => {
    prisma.zone.findFirst.mockResolvedValue({ id: zoneId });
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
    prisma.table.findMany.mockResolvedValue([{ number: 2 }]);

    const service = new TablesService(
      prisma as never,
      'https://guest.example.com',
    );

    await expect(
      service.bulkCreate({
        tenantId,
        zoneId,
        seats: 2,
        fromNumber: 1,
        toNumber: 3,
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.table.createMany).not.toHaveBeenCalled();
  });

  it('generates a valid PDF only for the supplied tenant tables', async () => {
    prisma.table.findMany.mockResolvedValue([
      {
        id: 'table-1',
        number: 1,
        seats: 4,
        qrToken: 'token-1',
        zoneId,
        tenant: { name: 'Cafe' },
      },
      {
        id: 'table-2',
        number: 2,
        seats: 4,
        qrToken: 'token-2',
        zoneId,
        tenant: { name: 'Cafe' },
      },
    ]);

    const service = new TablesService(
      prisma as never,
      'https://guest.example.com',
    );
    const pdf = await service.generateQrPdf({
      tenantId,
      tableIds: ['table-1', 'table-2'],
    });

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(prisma.table.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId, id: { in: ['table-1', 'table-2'] } },
      }),
    );
  });
});
