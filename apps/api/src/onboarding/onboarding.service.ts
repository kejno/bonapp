import {
  BadRequestException,
  ConflictException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';

interface PosSettings {
  posType: string;
  apiKey?: string;
  url?: string;
}

interface PosMenuItem { id: string; name: string; price: number; categoryId?: string; categoryName?: string }
interface ImportJob { tenantId: string; items?: PosMenuItem[] }

@Injectable()
export class OnboardingService implements OnModuleInit, OnModuleDestroy {
  private readonly queue: Queue;
  private readonly worker: Worker<ImportJob>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    config: ConfigService,
  ) {
    this.queue = new Queue('pos-menu-import', {
      connection: {
        host: config.get<string>('REDIS_HOST', 'localhost'),
        port: Number(config.get<string>('REDIS_PORT', '6379')),
      },
    });
    this.worker = new Worker('pos-menu-import', (job) => this.processImport(job), {
      connection: { host: config.get<string>('REDIS_HOST', 'localhost'), port: Number(config.get<string>('REDIS_PORT', '6379')) },
    });
    this.worker.on('failed', (job) => {
      if (!job) return;
      void (async () => {
        const db = this.prisma.forTenant(job.data.tenantId);
        const tenant = await db.tenant.findUnique({ where: { id: job.data.tenantId }, select: { posImportState: true } });
        const state = tenant?.posImportState as Record<string, unknown> | null;
        await db.tenant.update({ where: { id: job.data.tenantId }, data: { posImportState: {
          ...state, status: 'failed', message: 'Не удалось получить меню из POS. Проверьте подключение и повторите попытку.',
        } } });
      })();
    });
  }

  async onModuleInit(): Promise<void> { await this.worker.waitUntilReady(); }
  async onModuleDestroy(): Promise<void> { await this.worker.close(); await this.queue.close(); }

  async checkPos(input: PosSettings): Promise<{ pingMs: number; productCount: number }> {
    this.validate(input, true);
    const started = Date.now();
    try {
      const response = await fetch(`${input.url!.replace(/\/$/, '')}/api/v1/menu`, {
        headers: { Authorization: `Bearer ${input.apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`POS вернул HTTP ${response.status}`);
      const data: unknown = await response.json();
      const products = Array.isArray(data) ? data :
        data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)
          ? (data as { items: unknown[] }).items : null;
      if (!products) throw new Error('POS вернул некорректный список товаров');
      return { pingMs: Date.now() - started, productCount: products.length };
    } catch (error) {
      throw new ServiceUnavailableException(error instanceof Error ? error.message : 'Не удалось подключиться к POS');
    }
  }

  async savePos(input: PosSettings): Promise<{ posType: string }> {
    this.validate(input, false);
    const tenantId = this.requireTenant();
    const db = this.prisma.db;
    const current = await db.tenant.findUnique({ where: { id: tenantId }, select: { posImportState: true } });
    const importState = current?.posImportState as { status?: string } | null;
    await this.prisma.db.tenant.update({
      where: { id: tenantId },
      data: {
        posType: input.posType,
        posApiKey: input.posType === 'none' ? null : input.apiKey,
        posUrl: input.posType === 'none' ? null : input.url,
        posImportState: importState?.status === 'completed' ? importState :
          input.posType === 'none' ? { status: 'skipped' } : { status: 'idle', imported: 0, total: 0, failed: [] },
      },
    });
    return { posType: input.posType };
  }

  async startImport(): Promise<{ jobId: string }> {
    const tenantId = this.requireTenant();
    const tenant = await this.prisma.db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant?.posType || tenant.posType === 'none' || !tenant.posApiKey || !tenant.posUrl) {
      throw new BadRequestException('Сначала подключите POS-систему');
    }
    const current = tenant.posImportState as { status?: string } | null;
    if (current && !['idle', 'failed'].includes(current.status ?? '')) {
      throw new ConflictException(current.status === 'completed' ? 'Меню уже импортировано' : 'Импорт уже запущен или ожидает повторной обработки ошибок');
    }
    const job = await this.queue.add('import-menu', { tenantId }, { jobId: `menu-import-${tenantId}-${Date.now()}` });
    await this.prisma.db.tenant.update({ where: { id: tenantId }, data: { posImportState: { status: 'queued', jobId: job.id, imported: 0, total: 0, failed: [] } } });
    return { jobId: job.id! };
  }

  async retryImport(): Promise<{ jobId: string }> {
    const tenantId = this.requireTenant();
    const tenant = await this.prisma.db.tenant.findUnique({ where: { id: tenantId } });
    const state = tenant?.posImportState as { status?: string; failed?: unknown[] } | null;
    if (!state || state.status !== 'completed_with_errors' || !state.failed?.length) {
      throw new ConflictException('Нет позиций для повторного импорта');
    }
    const job = await this.queue.add('retry-menu-import', { tenantId, items: state.failed }, { jobId: `menu-import-retry-${tenantId}-${Date.now()}` });
    return { jobId: job.id! };
  }

  async getImportStatus(): Promise<unknown> {
    const tenantId = this.requireTenant();
    const tenant = await this.prisma.db.tenant.findUnique({ where: { id: tenantId }, select: { posImportState: true } });
    return tenant?.posImportState ?? { status: 'idle', imported: 0, total: 0, failed: [] };
  }

  private async processImport(job: Job<ImportJob>): Promise<void> {
    const { tenantId } = job.data;
    const db = this.prisma.forTenant(tenantId);
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant?.posUrl || !tenant.posApiKey) throw new Error('Настройки POS не найдены');
    const state = tenant.posImportState as { imported?: number } | null;
    const response = await fetch(`${tenant.posUrl.replace(/\/$/, '')}/api/v1/menu`, {
      headers: { Authorization: `Bearer ${tenant.posApiKey}` }, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`POS вернул HTTP ${response.status}`);
    const payload: unknown = await response.json();
    const items = job.data.items ?? (Array.isArray(payload) ? payload :
      payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)
        ? (payload as { items: unknown[] }).items : []);
    const valid = items.filter((item): item is PosMenuItem => this.isMenuItem(item));
    let imported = state?.imported ?? 0;
    const failed: Array<{ name: string; reason: string; id: string; price: number; categoryId?: string; categoryName?: string }> = [];
    const total = imported + valid.length;
    let processed = 0;
    await db.tenant.update({ where: { id: tenantId }, data: { posImportState: { status: 'running', imported, total, failed: [] } } });
    for (const item of valid) {
      try {
        await this.prisma.transactionForTenant(tenantId, async (tx) => {
          const category = item.categoryId ? await tx.menuCategory.findFirst({ where: { tenantId, posCategoryId: item.categoryId } }) : null;
          const targetCategory = category ?? await tx.menuCategory.create({ data: { tenantId, name: item.categoryName || 'Импортировано из POS', sortOrder: 0, posCategoryId: item.categoryId ?? null } });
          const existing = await tx.menuItem.findFirst({ where: { tenantId, posItemId: item.id } });
          if (!existing) await tx.menuItem.create({ data: { tenantId, categoryId: targetCategory.id, name: item.name, priceByn: item.price, posItemId: item.id } });
        });
        imported += 1;
      } catch (error) {
        failed.push({ ...item, reason: error instanceof Error ? error.message : 'Неизвестная ошибка' });
      }
      processed += 1;
      const status = processed === valid.length ? (failed.length ? 'completed_with_errors' : 'completed') : 'running';
      await db.tenant.update({ where: { id: tenantId }, data: { posImportState: { status, imported, total, failed } } });
      await job.updateProgress({ imported, total, failed: failed.length });
    }
    if (!valid.length) await db.tenant.update({ where: { id: tenantId }, data: { posImportState: { status: 'completed', imported, total, failed: [] } } });
  }

  private isMenuItem(value: unknown): value is PosMenuItem {
    if (!value || typeof value !== 'object') return false;
    const item = value as Partial<PosMenuItem>;
    return typeof item.id === 'string' && !!item.id && typeof item.name === 'string' && !!item.name &&
      typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0;
  }

  private requireTenant(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new BadRequestException('Не удалось определить тенант');
    return tenantId;
  }

  private validate(input: PosSettings, credentialsRequired: boolean): void {
    if (!input || !['iiko', 'r_keeper', 'none'].includes(input.posType)) throw new BadRequestException('Выберите поддерживаемую POS-систему');
    if (input.posType === 'none' && !credentialsRequired) return;
    if (typeof input.apiKey !== 'string' || !input.apiKey.trim()) throw new BadRequestException('Укажите API-ключ');
    let url: URL;
    try { url = new URL(input.url ?? ''); } catch { throw new BadRequestException('Укажите корректный URL POS-системы'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('Укажите корректный URL POS-системы');
  }
}
