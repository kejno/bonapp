import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import QRCode from 'qrcode';
import puppeteer from 'puppeteer';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  let browser: Awaited<ReturnType<typeof puppeteer.launch>>;

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
    let renderedHtml = '';
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const newPage = browser.newPage.bind(browser);
    jest.spyOn(browser, 'newPage').mockImplementation(async (...args) => {
      const page = await newPage(...args);
      const setContent = page.setContent.bind(page);
      jest.spyOn(page, 'setContent').mockImplementation(async (html, options) => {
        renderedHtml = html;
        await setContent(html, options);
      });
      return page;
    });
    Object.assign(pdfService, {
      cache,
      prisma,
      browser,
      getRenderedHtml: () => renderedHtml,
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
    app.setGlobalPrefix('api/v1');
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
    expect(pdf.length).toBeGreaterThan(1000);
    const pdfStructure = pdf.toString('latin1');
    const pageCount = pdfStructure.match(/\/Type\s*\/Page\b/g)?.length ?? 0;
    const imageCount = pdfStructure.match(/\/Subtype\s*\/Image\b/g)?.length ?? 0;
    expect(pageCount).toBe(2);
    expect(imageCount).toBeGreaterThanOrEqual(2);

    const directory = await mkdtemp(join(tmpdir(), 'bnp-387-'));
    const pdfPath = join(directory, 'selected-tables.pdf');
    try {
      await writeFile(pdfPath, pdf);
      const pdfPage = await browser.newPage();
      try {
        await pdfPage.setViewport({ width: 1600, height: 1200 });
        await pdfPage.goto(`file://${pdfPath}`);
        const expectedQrCodes = [
          'https://bonapp.by/t/qr-token-1',
          'https://bonapp.by/t/qr-token-2',
        ];
        for (let pageNumber = 0; pageNumber < 2; pageNumber += 1) {
          if (pageNumber > 0) {
            await pdfPage.keyboard.press('PageDown');
            await new Promise((resolve) => setTimeout(resolve, 300));
          } else {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          const screenshot = PNG.sync.read(
            Buffer.from(await pdfPage.screenshot()),
          );
          const decodedQrCodes = new Set<string>();
          const regionSize = 320;
          const step = 160;
          for (let top = 0; top + regionSize <= screenshot.height; top += step) {
            for (let left = 0; left + regionSize <= screenshot.width; left += step) {
              const data = new Uint8ClampedArray(regionSize * regionSize * 4);
              for (let row = 0; row < regionSize; row += 1) {
                const sourceStart = ((top + row) * screenshot.width + left) * 4;
                const targetStart = row * regionSize * 4;
                data.set(screenshot.data.subarray(sourceStart, sourceStart + regionSize * 4), targetStart);
              }
              const decoded = jsQR(data, regionSize, regionSize);
              if (decoded) decodedQrCodes.add(decoded.data);
            }
          }
          expect([...decodedQrCodes].sort()).toEqual(expectedQrCodes);
        }
      } finally {
        await pdfPage.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }

    const findMany = (
      pdfService as unknown as {
        prisma: { forTenant: () => { table: { findMany: jest.Mock } } };
      }
    ).prisma.forTenant().table.findMany;
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: selectedIds } } }),
    );
    const renderedHtml = (pdfService as unknown as { getRenderedHtml: () => string }).getRenderedHtml();
    const selectedQrImages = await Promise.all(selectedTables.map((number) =>
      QRCode.toDataURL(`https://bonapp.by/t/${tables[number - 1].qrToken}`),
    ));
    expect(renderedHtml).toContain('Стол 1');
    expect(renderedHtml).toContain('Стол 2');
    expect(renderedHtml).not.toContain('Стол 3');
    for (const qrImage of selectedQrImages) expect(renderedHtml).toContain(qrImage);
    expect(renderedHtml).not.toContain(await QRCode.toDataURL('https://bonapp.by/t/qr-token-3'));
  }, 30000);
});
