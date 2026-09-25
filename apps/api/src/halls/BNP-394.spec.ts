import { TableQrPdfService } from './table-qr-pdf.service';

describe('BNP-394: PDF cache invalidation after table changes', () => {
  it('generates a fresh PDF when a table changes', async () => {
    const table = { id: 'table-1', tableNumber: 1, qrToken: 'token-1' };
    const values = new Map<string, string>();
    const keys: string[] = [];
    const cache = {
      getJson: jest.fn((key: string): Promise<string | null> => {
        keys.push(key);
        return Promise.resolve(values.get(key) ?? null);
      }),
      setJson: jest.fn((key: string, value: string) => {
        values.set(key, value);
        return Promise.resolve(undefined);
      }),
    };
    const prisma = {
      forTenant: () => ({
        tenant: { findUnique: jest.fn().mockResolvedValue({ name: 'Cafe', logoUrl: null, updatedAt: new Date('2026-01-01T00:00:00.000Z') }) },
        table: { findMany: jest.fn().mockImplementation(() => Promise.resolve([{ ...table }])) },
      }),
    };
    const service = Object.create(TableQrPdfService.prototype) as TableQrPdfService;
    const render = jest.fn().mockResolvedValue(Buffer.from('%PDF'));
    Object.assign(service, { cache, prisma, render });

    await service.generate('tenant-1');
    await service.generate('tenant-1');
    expect(render).toHaveBeenCalledTimes(1);
    table.tableNumber = 2;
    await service.generate('tenant-1');

    expect(keys[0]).toBe(keys[1]);
    expect(keys[1]).not.toBe(keys[2]);
    expect(render).toHaveBeenCalledTimes(2);
  });
});
