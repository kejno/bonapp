import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

export const MAX_SYNCHRONOUS_TABLES = 20;
export const PDF_CACHE_TTL_SECONDS = 60 * 60;
export const TABLE_TENT_REPOSITORY = Symbol('TABLE_TENT_REPOSITORY');
export const TABLE_TENT_PDF_RENDERER = Symbol('TABLE_TENT_PDF_RENDERER');
export const PDF_CACHE = Symbol('PDF_CACHE');
export const PDF_JOB_QUEUE = Symbol('PDF_JOB_QUEUE');

export interface TableTent {
  id: string;
  number: string;
  qrToken: string;
}

export interface TenantBranding {
  name: string;
  logoUrl: string | null;
}

export interface TableTentRepository {
  findTenant(tenantId: string): Promise<TenantBranding | null>;
  findTables(tenantId: string, tableIds?: string[]): Promise<TableTent[]>;
}

export interface TableTentPdfRenderer {
  render(input: {
    tenantName: string;
    logoUrl: string | null;
    tables: Array<TableTent & { qrUrl: string }>;
  }): Promise<Buffer>;
}

export interface PdfCache {
  get(key: string): Promise<Buffer | undefined>;
  set(key: string, value: Buffer, ttlSeconds: number): Promise<void>;
}

export interface PdfJobQueue {
  add(
    name: string,
    data: { tenantId: string; tableIds?: string[] },
  ): Promise<{ id?: string }>;
}

@Injectable()
export class TableTentPdfService {
  constructor(
    @Inject(TABLE_TENT_REPOSITORY)
    private readonly repository: TableTentRepository,
    @Inject(TABLE_TENT_PDF_RENDERER)
    private readonly renderer: TableTentPdfRenderer,
    @Inject(PDF_CACHE)
    private readonly cache: PdfCache,
    @Inject(PDF_JOB_QUEUE)
    private readonly queue: PdfJobQueue,
  ) {}

  async generate(tenantId: string, tableIds?: string[]): Promise<Buffer> {
    const { tenant, tables } = await this.resolve(tenantId, tableIds);
    const cacheKey = this.cacheKey(tenantId, tenant, tables);
    const cachedPdf = await this.cache.get(cacheKey);

    if (cachedPdf) {
      return cachedPdf;
    }

    const pdf = await this.renderer.render({
      tenantName: tenant.name,
      logoUrl: tenant.logoUrl,
      tables: tables.map((table) => ({
        ...table,
        qrUrl: `https://bonapp.by/t/${table.qrToken}`,
      })),
    });
    await this.cache.set(cacheKey, pdf, PDF_CACHE_TTL_SECONDS);
    return pdf;
  }

  async request(
    tenantId: string,
    tableIds?: string[],
  ): Promise<{ pdf?: Buffer; jobId?: string }> {
    const { tables } = await this.resolve(tenantId, tableIds);
    if (tables.length <= MAX_SYNCHRONOUS_TABLES) {
      return { pdf: await this.generate(tenantId, tableIds) };
    }

    const job = await this.queue.add('generate', { tenantId, tableIds });
    return { jobId: job.id };
  }

  private async resolve(tenantId: string, tableIds?: string[]) {
    const [tenant, tables] = await Promise.all([
      this.repository.findTenant(tenantId),
      this.repository.findTables(tenantId, tableIds),
    ]);

    if (!tenant) {
      throw new Error('Tenant not found');
    }
    return {
      tenant,
      tables: tableIds
        ? tables.filter((table) => tableIds.includes(table.id))
        : tables,
    };
  }

  private cacheKey(
    tenantId: string,
    tenant: TenantBranding,
    tables: TableTent[],
  ): string {
    const tableSignature = tables
      .map((table) => `${table.id}:${table.number}:${table.qrToken}`)
      .sort()
      .join('|');
    const contentSignature = `${tenant.name}:${tenant.logoUrl ?? ''}:${tableSignature}`;
    return `table-tent-pdf:${tenantId}:${createHash('sha256').update(contentSignature).digest('hex')}`;
  }
}
