import { NotFoundException } from '@nestjs/common';
jest.mock('puppeteer', () => ({}), { virtual: true });
jest.mock('qrcode', () => ({}), { virtual: true });
import { TableQrPdfService } from './table-qr-pdf.service';

describe('TableQrPdfService job ownership', () => {
  let service: TableQrPdfService;
  const cache = { getJson: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = Object.create(TableQrPdfService.prototype) as TableQrPdfService;
    (service as unknown as { cache: typeof cache }).cache = cache;
  });

  it('returns a job only to its owning tenant', async () => {
    const job = { status: 'ready', tenantId: 'tenant-1', downloadUrl: '/file' };
    cache.getJson.mockResolvedValue(job);

    await expect(service.getJob('job-1', 'tenant-2')).rejects.toThrow(NotFoundException);
    expect(await service.getJob('job-1', 'tenant-1')).toEqual({ status: 'ready', downloadUrl: '/file' });
  });

  it('checks job ownership before returning its PDF file', async () => {
    cache.getJson
      .mockResolvedValueOnce({ status: 'ready', tenantId: 'tenant-1' })
      .mockResolvedValueOnce({ status: 'ready', tenantId: 'tenant-1' })
      .mockResolvedValueOnce('JVBERi0=');

    await expect(service.getFile('job-1', 'tenant-2')).rejects.toThrow(NotFoundException);
    expect(cache.getJson).toHaveBeenCalledTimes(1);
    await expect(service.getFile('job-1', 'tenant-1')).resolves.toEqual(Buffer.from('%PDF-'));
  });
});

describe('TableQrPdfService cache identity', () => {
  it('includes the tenant name in the PDF cache key', async () => {
    const service = Object.create(TableQrPdfService.prototype) as TableQrPdfService;
    const requestedKeys: string[] = [];
    const cache = {
      getJson: jest.fn((key: string): Promise<null> => {
        requestedKeys.push(key);
        return Promise.resolve(null);
      }),
      setJson: jest.fn(),
    };
    const tenant = { name: 'Cafe One', logoUrl: null };
    const prisma = { forTenant: () => ({ tenant: { findUnique: jest.fn().mockImplementation(() => ({ ...tenant })) }, table: { findMany: jest.fn().mockResolvedValue([{ id: 'table-1', tableNumber: 1, qrToken: 'token' }]) } }) };
    (service as unknown as { cache: typeof cache; prisma: typeof prisma }).cache = cache;
    (service as unknown as { prisma: typeof prisma }).prisma = prisma;
    const renderer = jest.fn(() => Promise.resolve(Buffer.from('%PDF-')));
    (service as unknown as { render: typeof renderer }).render = renderer;

    await service.generate('tenant-1');
    tenant.name = 'Cafe Two';
    await service.generate('tenant-1');

    expect(requestedKeys[0]).not.toBe(requestedKeys[1]);
  });

  it('keeps a generated job PDF for the full job lifetime', async () => {
    const service = Object.create(TableQrPdfService.prototype) as TableQrPdfService;
    const cache = { setJson: jest.fn() };
    (service as unknown as { cache: typeof cache }).cache = cache;

    await (service as unknown as { storeJobFile: (jobId: string, pdf: Buffer) => Promise<void> })
      .storeJobFile('job-1', Buffer.from('%PDF-'));

    expect(cache.setJson).toHaveBeenCalledWith('tables:qr-pdf:file:job-1', 'JVBERi0=', 86400);
  });
});
