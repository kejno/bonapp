import { Inject, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import puppeteer from 'puppeteer';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import type { Job } from 'bullmq';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../cache/cache.constants';
import { createGuestTableUrl } from './guest-table-url';

export const QR_PDF_SYNC_LIMIT = 20;
const PDF_TTL_SECONDS = 3600;
const JOB_TTL_SECONDS = 86400;
const JOB_PREFIX = 'tables:qr-pdf:job:';
const FILE_PREFIX = 'tables:qr-pdf:file:';
const MAX_LOGO_BYTES = 2_000_000;
const MAX_LOGO_PIXELS = 16_000_000;
const MAX_LOGO_WIDTH = 1200;
const MAX_LOGO_HEIGHT = 500;
const LOGO_SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  'image/png': (bytes) => bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a,
  'image/jpeg': (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/gif': (bytes) => bytes.length >= 6 && Buffer.from(bytes.subarray(0, 6)).toString('ascii').match(/^GIF8[79]a$/) !== null,
  'image/webp': (bytes) => bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP',
};

export interface PdfJob {
  status: 'pending' | 'ready' | 'failed';
  downloadUrl?: string;
  error?: string;
}

interface PdfJobRecord extends PdfJob {
  tenantId: string;
}

@Injectable()
export class TableQrPdfService implements OnModuleInit, OnModuleDestroy {
  private browser?: Awaited<ReturnType<typeof puppeteer.launch>>;
  private readonly queue: Queue;
  private readonly connection: Redis;
  private worker?: Worker;
  constructor(private readonly prisma: PrismaService, private readonly cache: CacheService, @Inject(REDIS_CLIENT) redis: Redis) {
    this.connection = redis.duplicate({ maxRetriesPerRequest: null });
    this.queue = new Queue('table-qr-pdf', { connection: this.connection });
  }

  onModuleInit(): void {
    this.worker = new Worker('table-qr-pdf', async (job: Job<{ jobId: string; tenantId: string; cacheKey: string; name: string; logoUrl: string | null; tables: Array<{ id: string; tableNumber: number; qrToken: string }> }>) => {
      const { jobId, tenantId, cacheKey, name, logoUrl, tables } = job.data;
      try {
        const cachedPdf = await this.cache.getJson<string>(`${FILE_PREFIX}${cacheKey}`);
        const pdf = cachedPdf ? Buffer.from(cachedPdf, 'base64') : await this.render(name, logoUrl, tables);
        if (!cachedPdf) await this.cache.setJson(`${FILE_PREFIX}${cacheKey}`, pdf.toString('base64'), PDF_TTL_SECONDS);
        await this.storeJobFile(jobId, pdf);
        const statusUrl = `/api/v1/admin/tables/generate-qr-pdf/jobs/${jobId}`;
        await this.cache.setJson(`${JOB_PREFIX}${jobId}`, { tenantId, status: 'ready', downloadUrl: `${statusUrl}/file` } satisfies PdfJobRecord, JOB_TTL_SECONDS);
      } catch {
        await this.cache.setJson(`${JOB_PREFIX}${jobId}`, { tenantId, status: 'failed', error: 'Не удалось сформировать PDF' } satisfies PdfJobRecord, JOB_TTL_SECONDS);
      }
    }, { connection: this.connection.duplicate({ maxRetriesPerRequest: null }) });
  }

  async generate(tenantId: string, tableIds?: string[]): Promise<Buffer | { jobId: string; statusUrl: string }> {
    const tenant = await this.prisma.forTenant(tenantId).tenant.findUnique({
      where: { id: tenantId }, select: { name: true, logoUrl: true, updatedAt: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const tables = await this.prisma.forTenant(tenantId).table.findMany({
      where: tableIds ? { id: { in: tableIds } } : {},
      orderBy: [{ areaId: 'asc' }, { tableNumber: 'asc' }],
      select: { id: true, tableNumber: true, qrToken: true },
    });
    if (tableIds && tables.length !== new Set(tableIds).size) throw new NotFoundException('One or more tables not found');
    if (!tables.length) throw new NotFoundException('No tables found');
    const key = this.cacheKey(tenantId, tenant.name, tables.map((t) => `${t.id}:${t.tableNumber}:${t.qrToken}`), tenant.logoUrl, tenant.updatedAt);
    const cached = await this.cache.getJson<string>(`${FILE_PREFIX}${key}`);
    if (tables.length <= QR_PDF_SYNC_LIMIT) {
      if (cached) return Buffer.from(cached, 'base64');
      const pdf = await this.render(tenant.name, tenant.logoUrl, tables);
      await this.cache.setJson(`${FILE_PREFIX}${key}`, pdf.toString('base64'), PDF_TTL_SECONDS);
      return pdf;
    }
    const jobId = randomUUID();
    const statusUrl = `/api/v1/admin/tables/generate-qr-pdf/jobs/${jobId}`;
    await this.cache.setJson(`${JOB_PREFIX}${jobId}`, { tenantId, status: 'pending' } satisfies PdfJobRecord, JOB_TTL_SECONDS);
    await this.queue.add('generate', { jobId, tenantId, cacheKey: key, name: tenant.name, logoUrl: tenant.logoUrl, tables }, { removeOnComplete: true, removeOnFail: true });
    return { jobId, statusUrl };
  }

  async getJob(jobId: string, tenantId: string): Promise<PdfJob> {
    const job = await this.getOwnedJob(jobId, tenantId);
    const publicJob: PdfJob = { status: job.status };
    if (job.downloadUrl) publicJob.downloadUrl = job.downloadUrl;
    if (job.error) publicJob.error = job.error;
    return publicJob;
  }

  async getFile(jobId: string, tenantId: string): Promise<Buffer> {
    await this.getOwnedJob(jobId, tenantId);
    const file = await this.cache.getJson<string>(`${FILE_PREFIX}${jobId}`);
    if (!file) throw new NotFoundException('PDF file not found');
    return Buffer.from(file, 'base64');
  }

  private async getOwnedJob(jobId: string, tenantId: string): Promise<PdfJobRecord> {
    const job = await this.cache.getJson<PdfJobRecord>(`${JOB_PREFIX}${jobId}`);
    if (!job || job.tenantId !== tenantId) throw new NotFoundException('PDF job not found');
    return job;
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    await this.connection.quit();
    await this.browser?.close();
  }

  private async storeJobFile(jobId: string, pdf: Buffer): Promise<void> {
    await this.cache.setJson(`${FILE_PREFIX}${jobId}`, pdf.toString('base64'), JOB_TTL_SECONDS);
  }

  private cacheKey(tenantId: string, name: string, ids: string[], logoUrl: string | null, tenantUpdatedAt: Date): string {
    return createHash('sha256').update(JSON.stringify([tenantId, name, [...ids].sort(), logoUrl, tenantUpdatedAt])).digest('hex');
  }

  private async render(name: string, logoUrl: string | null, tables: Array<{ tableNumber: number; qrToken: string }>): Promise<Buffer> {
    const logo = await this.logoData(logoUrl);
    const menuBaseUrl = process.env.GUEST_MENU_URL?.trim() || 'https://bonapp.by/menu';
    const entries = await Promise.all(tables.map(async (table) => ({ ...table, qr: await QRCode.toDataURL(createGuestTableUrl(menuBaseUrl, table.qrToken)) })));
    const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
    const sheets: string[] = [];
    for (const table of entries) {
      sheets.push(`<section class="sheet"><article><img class="logo" src="${logo}"/><h1>${escape(name)}</h1><div class="table">Стол ${table.tableNumber}</div><img class="qr" src="${table.qr}"/></article></section>`);
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}.sheet{height:273mm;page-break-after:always}.sheet:last-child{page-break-after:auto}article{height:100%;border:1px dashed #aaa;display:flex;flex-direction:column;align-items:center;justify-content:center}.logo{max-width:65mm;max-height:28mm;object-fit:contain}.qr{width:85mm;height:85mm}.table{font-size:32pt;font-weight:bold;margin:10mm}h1{font-size:20pt}</style></head><body>${sheets.join('')}</body></html>`;
    this.browser ??= await puppeteer.launch({ headless: true });
    const page = await this.browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(async () => {
        await Promise.all(Array.from(document.images, (image) => image.decode()));
      });
      return Buffer.from(await page.pdf({ format: 'A4', printBackground: true }));
    }
    finally { await page.close(); }
  }

  private async logoData(url: string | null): Promise<string> {
    const fallback = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="100%" height="100%" fill="#e0533c"/><text x="50%" y="58%" text-anchor="middle" font-family="Arial" font-size="36" fill="white">bonapp</text></svg>').toString('base64');
    if (!url) return fallback;

    const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT;
    const bucket = process.env.S3_BUCKET;
    if (!publicEndpoint || !bucket) return fallback;

    let logoUrl: URL;
    let storageUrl: URL;
    try {
      logoUrl = new URL(url);
      storageUrl = new URL(publicEndpoint);
    } catch {
      return fallback;
    }
    const storagePath = `${storageUrl.pathname.replace(/\/$/, '')}/${encodeURIComponent(bucket)}/`;
    if (
      !['https:', 'http:'].includes(logoUrl.protocol) ||
      logoUrl.protocol !== storageUrl.protocol ||
      logoUrl.origin !== storageUrl.origin ||
      !logoUrl.pathname.startsWith(storagePath) ||
      logoUrl.username ||
      logoUrl.password
    ) return fallback;
    try {
      const response = await fetch(logoUrl, { signal: AbortSignal.timeout(3000), redirect: 'error' });
      const type = (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
      const signatureMatches = LOGO_SIGNATURES[type];
      const contentLength = Number(response.headers.get('content-length'));
      if (!response.ok || !signatureMatches || (Number.isFinite(contentLength) && contentLength > MAX_LOGO_BYTES) || !response.body) {
        await response.body?.cancel();
        throw new Error('Invalid logo');
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_LOGO_BYTES) {
            await reader.cancel();
            throw new Error('Logo too large');
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size);
      if (!signatureMatches(bytes)) throw new Error('Logo content does not match its MIME type');
      const safeLogo = await sharp(bytes, { limitInputPixels: MAX_LOGO_PIXELS })
        .resize(MAX_LOGO_WIDTH, MAX_LOGO_HEIGHT, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
      return `data:image/png;base64,${safeLogo.toString('base64')}`;
    } catch { return this.logoData(null); }
  }
}
