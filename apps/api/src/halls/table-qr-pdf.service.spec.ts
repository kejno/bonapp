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
