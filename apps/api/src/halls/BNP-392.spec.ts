import { TableQrPdfService } from './table-qr-pdf.service';

describe('BNP-392: PDF for all tenant tables', () => {
  it('requests every tenant table and renders them into the PDF', async () => {
    const tables = Array.from({ length: 5 }, (_, index) => ({
      id: `table-${index + 1}`,
      tableNumber: index + 1,
      qrToken: `token-${index + 1}`,
    }));
    const findMany = jest.fn().mockResolvedValue(tables);
    const cache = { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn() };
    const prisma = {
      forTenant: () => ({
        tenant: { findUnique: jest.fn().mockResolvedValue({ name: 'Cafe', logoUrl: null, updatedAt: new Date() }) },
        table: { findMany },
      }),
    };
    const service = Object.create(TableQrPdfService.prototype) as TableQrPdfService;
    const render = jest.fn().mockResolvedValue(Buffer.from('%PDF-tenant-tables'));
    Object.assign(service, { cache, prisma, render });

    const result = await service.generate('tenant-1');

    const findManyCalls = findMany.mock.calls as unknown as Array<[unknown]>;
    const query = findManyCalls[0]?.[0] as {
      where: Record<string, never>;
      select: { id: boolean };
    };
    expect(query.where).toEqual({});
    expect(query.select.id).toBe(true);
    expect(render).toHaveBeenCalledWith('Cafe', null, tables);
    expect(result).toEqual(Buffer.from('%PDF-tenant-tables'));
  });
});
