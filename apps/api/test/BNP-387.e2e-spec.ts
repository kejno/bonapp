import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthGuard } from '../src/auth/auth.guard';
import { TenantContextGuard } from '../src/auth/tenant-context.guard';
import { HallsService } from '../src/halls/halls.service';
import { TableQrPdfService } from '../src/halls/table-qr-pdf.service';
import { TablesController } from '../src/halls/tables.controller';

describe('BNP-387: PDF for selected tables', () => {
  let app: INestApplication;
  const selectedTables = [1, 2];
  const tables = [1, 2, 3].map((tableNumber) => ({
    id: `75fe5e2c-3b7b-4d76-9c19-bd0c32850a0${tableNumber}`,
    tableNumber,
    qrToken: `qr-token-${tableNumber}`,
  }));
  const pdfService = Object.create(
    TableQrPdfService.prototype,
  ) as TableQrPdfService;

  beforeAll(async () => {
    const cache = {
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn(),
    };
    const findMany = jest
      .fn()
      .mockImplementation(({ where }: { where: { id?: { in?: string[] } } }) =>
        Promise.resolve(
          tables.filter(({ id }) => !where.id?.in || where.id.in.includes(id)),
        ),
      );
    const prisma = {
      forTenant: () => ({
        tenant: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ name: 'Test Restaurant', logoUrl: null }),
        },
        table: { findMany },
      }),
    };
    const render = jest
      .fn()
      .mockResolvedValue(Buffer.from('%PDF-selected-tables'));
    Object.assign(pdfService, {
      cache,
      prisma,
      render,
      onModuleInit: () => undefined,
      onModuleDestroy: () => undefined,
    });
    const module = await Test.createTestingModule({
      controllers: [TablesController],
      providers: [
        { provide: HallsService, useValue: {} },
        { provide: TableQrPdfService, useValue: pdfService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantContextGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { user: unknown } };
        }) => {
          context.switchToHttp().getRequest().user = {
            tenantId: 'tenant-1',
            role: 'OWNER',
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    const browser = (
      pdfService as unknown as { browser?: { close: () => Promise<void> } }
    ).browser;
    await browser?.close();
  });

  it('returns a PDF rendered from only the selected tables', async () => {
    const selectedIds = selectedTables.map((number) => tables[number - 1].id);
    const response = await request(app.getHttpServer() as never)
      .post('/api/v1/admin/tables/generate-qr-pdf')
      .send({ tableIds: selectedIds })
      .expect(200)
      .expect('Content-Type', /application\/pdf/);
    const pdf = response.body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString()).toBe('%PDF-selected-tables');
    const findMany = (
      pdfService as unknown as {
        prisma: { forTenant: () => { table: { findMany: jest.Mock } } };
      }
    ).prisma.forTenant().table.findMany;
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: selectedIds } } }),
    );
    expect(
      (pdfService as unknown as { render: jest.Mock }).render,
    ).toHaveBeenCalledWith(
      'Test Restaurant',
      null,
      selectedTables.map((number) => tables[number - 1]),
    );
  });
});
