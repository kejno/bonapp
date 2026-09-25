import { NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
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

describe('TableQrPdfService logo size validation', () => {
  const service = Object.create(TableQrPdfService.prototype) as TableQrPdfService;
  const logoData = (service as unknown as { logoData(url: string | null): Promise<string> }).logoData.bind(service);
  const fallbackPrefix = 'data:image/svg+xml;base64,';

  beforeEach(() => {
    process.env.S3_PUBLIC_ENDPOINT = 'https://example.com';
    process.env.S3_BUCKET = 'bonapp';
  });

  afterEach(() => {
    delete process.env.S3_PUBLIC_ENDPOINT;
    delete process.env.S3_BUCKET;
    jest.restoreAllMocks();
  });

  it('cancels the response stream as soon as the 2 MB limit is exceeded', async () => {
    const cancel = jest.fn().mockResolvedValue(undefined);
    const read = jest.fn()
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(1_500_000) })
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(600_000) });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/png' }),
      body: { getReader: () => ({ read, cancel }) },
    } as unknown as Response);

    await expect(logoData('https://example.com/bonapp/logo.png')).resolves.toMatch(fallbackPrefix);
    expect(read).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('rejects a declared image MIME type when the bytes do not match it', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(bytes, {
      headers: { 'content-type': 'image/png' },
    }));

    await expect(logoData('https://example.com/bonapp/logo.png')).resolves.toMatch(fallbackPrefix);
  });

  it('resizes decoded logos to bounded dimensions before passing them to Chromium', async () => {
    const oversizedDimensionsLogo = await sharp({
      create: { width: 2400, height: 1200, channels: 4, background: '#e0533c' },
    }).png().toBuffer();
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(oversizedDimensionsLogo, {
      headers: { 'content-type': 'image/png' },
    }));

    const dataUrl = await logoData('https://example.com/bonapp/logo.png');
    const decoded = Buffer.from(dataUrl.split(',')[1], 'base64');
    const metadata = await sharp(decoded).metadata();

    expect(metadata.width).toBeLessThanOrEqual(1200);
    expect(metadata.height).toBeLessThanOrEqual(500);
  });

  it('falls back when a logo exceeds the decoded pixel limit', async () => {
    const excessivePixelLogo = await sharp({
      create: { width: 5000, height: 4000, channels: 4, background: '#e0533c' },
    }).png().toBuffer();
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(excessivePixelLogo, {
      headers: { 'content-type': 'image/png' },
    }));

    await expect(logoData('https://example.com/bonapp/logo.png')).resolves.toMatch(fallbackPrefix);
  });
});

describe('TableQrPdfService logo URL security', () => {
  const service = Object.create(TableQrPdfService.prototype) as TableQrPdfService;
  const logoData = (service as unknown as { logoData(url: string | null): Promise<string> }).logoData.bind(service);

  afterEach(() => {
    delete process.env.S3_PUBLIC_ENDPOINT;
    delete process.env.S3_BUCKET;
    jest.restoreAllMocks();
  });

  it.each([
    'https://169.254.169.254/latest/meta-data/',
    'https://storage.example.com.attacker.test/bonapp/logo.png',
    'https://storage.example.com/other-bucket/logo.png',
  ])('does not fetch an untrusted URL: %s', async (url) => {
    process.env.S3_PUBLIC_ENDPOINT = 'https://storage.example.com';
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(logoData(url)).resolves.toMatch('data:image/svg+xml;base64,');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not follow redirects from the configured storage host', async () => {
    process.env.S3_PUBLIC_ENDPOINT = 'https://storage.example.com';
    process.env.S3_BUCKET = 'bonapp';
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 302 }));

    await expect(logoData('https://storage.example.com/bonapp/tenant/logo.png')).resolves.toMatch('data:image/svg+xml;base64,');
    expect(global.fetch).toHaveBeenCalledWith(
      new URL('https://storage.example.com/bonapp/tenant/logo.png'),
      expect.objectContaining({ redirect: 'error' }),
    );
  });
});
