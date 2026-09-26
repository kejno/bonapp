import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthGuard } from '../auth/auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { HallsService } from './halls.service';
import { TableQrPdfService } from './table-qr-pdf.service';
import { TablesController } from './tables.controller';

describe('Table QR PDF integration', () => {
  let app: INestApplication;
  let service: TableQrPdfService;
  const tables = [1, 2, 3].map((tableNumber) => ({
    id: [
      '75fe5e2c-3b7b-4d76-9c19-bd0c32850a0e',
      '84c022c4-3614-463b-a1f3-1d97c1c888f7',
      'b4795a89-45e8-48ba-b61f-bb5fb3d5f0be',
    ][tableNumber - 1],
    tableNumber,
    qrToken: `qr-token-${tableNumber}`,
  }));

  beforeAll(async () => {
    service = Object.create(TableQrPdfService.prototype) as TableQrPdfService;
    const cache = { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn() };
    const prisma = {
      forTenant: () => ({
        tenant: { findUnique: jest.fn().mockResolvedValue({ name: 'Test Restaurant', logoUrl: null }) },
        table: { findMany: jest.fn().mockResolvedValue(tables) },
      }),
    };
    Object.assign(service, {
      cache,
      prisma,
      render: jest.fn().mockResolvedValue(Buffer.concat([
        Buffer.from('%PDF-'),
        Buffer.alloc(1024),
      ])),
      onModuleInit: () => undefined,
      onModuleDestroy: () => undefined,
    });

    const module = await Test.createTestingModule({
      controllers: [TablesController],
      providers: [
        { provide: HallsService, useValue: {} },
        { provide: TableQrPdfService, useValue: service },
      ],
    })
      .overrideGuard(AuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(TenantContextGuard).useValue({ canActivate: (context: { switchToHttp: () => { getRequest: () => { user: unknown } } }) => {
        context.switchToHttp().getRequest().user = {
          tenantId: 'tenant-1',
          role: 'OWNER',
        };
        return true;
      } })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    const browser = (service as unknown as { browser?: { close: () => Promise<void> } }).browser;
    await browser?.close();
  });

  it('returns a valid PDF with application/pdf for three tables', async () => {
    const response = await request(app.getHttpServer() as never)
      .post('/api/v1/admin/tables/generate-qr-pdf')
      .send({ tableIds: tables.map((table) => table.id) })
      .expect(200)
      .expect('Content-Type', /application\/pdf/);

    const pdf = response.body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
