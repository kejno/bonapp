import { Inject, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import puppeteer from 'puppeteer';
import QRCode from 'qrcode';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import type { Job } from 'bullmq';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../cache/cache.constants';

export const QR_PDF_SYNC_LIMIT = 20;
const PDF_TTL_SECONDS = 3600;
const JOB_TTL_SECONDS = 86400;
const JOB_PREFIX = 'tables:qr-pdf:job:';
const FILE_PREFIX = 'tables:qr-pdf:file:';

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
        await this.cache.setJson(`${FILE_PREFIX}${jobId}`, pdf.toString('base64'), PDF_TTL_SECONDS);
        const statusUrl = `/api/v1/admin/tables/generate-qr-pdf/jobs/${jobId}`;
        await this.cache.setJson(`${JOB_PREFIX}${jobId}`, { tenantId, status: 'ready', downloadUrl: `${statusUrl}/file` } satisfies PdfJobRecord, JOB_TTL_SECONDS);
      } catch {
        await this.cache.setJson(`${JOB_PREFIX}${jobId}`, { tenantId, status: 'failed', error: 'Не удалось сформировать PDF' } satisfies PdfJobRecord, JOB_TTL_SECONDS);
      }
    }, { connection: this.connection.duplicate({ maxRetriesPerRequest: null }) });
  }

  async generate(tenantId: string, tableIds?: string[]): Promise<Buffer | { jobId: string; statusUrl: string }> {
    const tenant = await this.prisma.forTenant(tenantId).tenant.findUnique({
      where: { id: tenantId }, select: { name: true, logoUrl: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const tables = await this.prisma.forTenant(tenantId).table.findMany({
      where: tableIds ? { id: { in: tableIds } } : {},
      orderBy: [{ areaId: 'asc' }, { tableNumber: 'asc' }],
      select: { id: true, tableNumber: true, qrToken: true },
    });
    if (tableIds && tables.length !== new Set(tableIds).size) throw new NotFoundException('One or more tables not found');
    if (!tables.length) throw new NotFoundException('No tables found');
    const key = this.cacheKey(tenantId, tables.map((t) => `${t.id}:${t.tableNumber}:${t.qrToken}`), tenant.logoUrl);
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

  private cacheKey(tenantId: string, ids: string[], logoUrl: string | null): string {
    return createHash('sha256').update(JSON.stringify([tenantId, [...ids].sort(), logoUrl])).digest('hex');
  }

  private async render(name: string, logoUrl: string | null, tables: Array<{ tableNumber: number; qrToken: string }>): Promise<Buffer> {
    const logo = await this.logoData(logoUrl);
    const entries = await Promise.all(tables.map(async (table) => ({ ...table, qr: await QRCode.toDataURL(`https://bonapp.by/t/${encodeURIComponent(table.qrToken)}`) })));
    const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
    const sheets: string[] = [];
    for (let i = 0; i < entries.length; i += 4) {
      const group = entries.slice(i, i + 4);
      for (const side of [group, [...group].reverse()]) {
        const cards = side.map((t) => `<article><img class="logo" src="${logo}"/><h1>${escape(name)}</h1><div class="table">Стол ${t.tableNumber}</div><img class="qr" src="${t.qr}"/></article>`).join('');
        sheets.push(`<section class="sheet"><div class="grid">${cards}</div><footer>Печать с двух сторон с переворотом по короткой стороне. Разрезать по меткам и согнуть по линии сгиба.</footer></section>`);
      }
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:8mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}.sheet{height:281mm;page-break-after:always;display:flex;flex-direction:column}.grid{flex:1;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}.grid article{border:1px dashed #888;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative}.grid article:after{content:'';position:absolute;top:50%;left:0;right:0;border-top:1px dotted #aaa}.logo{max-width:42mm;max-height:18mm;object-fit:contain}.qr{width:42mm;height:42mm}.table{font-size:24pt;font-weight:bold;margin:6mm}h1{font-size:14pt}footer{text-align:center;font-size:8pt;padding:2mm}</style></head><body>${sheets.join('')}</body></html>`;
    this.browser ??= await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await this.browser.newPage();
    try { await page.setContent(html, { waitUntil: 'load' }); return Buffer.from(await page.pdf({ format: 'A4', printBackground: true })); }
    finally { await page.close(); }
  }

  private async logoData(url: string | null): Promise<string> {
    if (!url || !/^https:\/\//i.test(url)) return 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="100%" height="100%" fill="#e0533c"/><text x="50%" y="58%" text-anchor="middle" font-family="Arial" font-size="36" fill="white">bonapp</text></svg>').toString('base64');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      const type = response.headers.get('content-type') ?? '';
      if (!response.ok || !type.startsWith('image/') || Number(response.headers.get('content-length')) > 2_000_000) throw new Error('Invalid logo');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 2_000_000) throw new Error('Logo too large');
      return `data:${type};base64,${bytes.toString('base64')}`;
    } catch { return this.logoData(null); }
  }
}
