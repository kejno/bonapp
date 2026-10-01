import { BadRequestException, ConflictException, Injectable, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PosProvider } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import { createDecipheriv } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';

type Credentials = { login: string; password_encrypted: string; concept_id: string; base_url?: string };
type Product = { id: string; name: string; price?: number; image?: string; categoryId?: string; categoryName?: string };
type SyncJob = { tenantId: string };

@Injectable()
export class IikoService implements OnModuleInit, OnModuleDestroy {
  private readonly queue: Queue<SyncJob>;
  private readonly worker: Worker<SyncJob>;

  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContextService, config: ConfigService) {
    const connection = { host: config.get<string>('REDIS_HOST', 'localhost'), port: Number(config.get<string>('REDIS_PORT', '6379')) };
    this.queue = new Queue<SyncJob>('iiko-sync-menu', { connection });
    this.worker = new Worker<SyncJob>('iiko-sync-menu', (job) => this.process(job), { connection });
    this.worker.on('failed', (job) => {
      if (!job || job.attemptsMade !== (job.opts.attempts ?? 1)) return;
      void this.state(job.data.tenantId).then((state) => this.setState(job.data.tenantId, { status: 'UNAVAILABLE', startedAt: state?.startedAt ?? null, completedAt: new Date().toISOString(), error: 'iiko Cloud API недоступен после трёх попыток' }));
    });
  }

  async onModuleInit() { await this.worker.waitUntilReady(); }
  async onModuleDestroy() { await this.worker.close(); await this.queue.close(); }

  async enqueueSync(): Promise<{ jobId: string; status: 'PENDING' }> {
    const tenantId = this.requireTenant();
    const prior = await this.state(tenantId);
    if (prior?.status === 'PENDING' || prior?.status === 'RUNNING') throw new ConflictException('Синхронизация меню уже выполняется');
    const config = await this.prisma.forTenant(tenantId).posIntegrationConfig.findFirst({ where: { provider: PosProvider.IIKO } });
    if (!config) throw new BadRequestException('Для тенанта не настроено подключение iiko');
    await this.setState(tenantId, { status: 'PENDING', startedAt: null, completedAt: null, error: null });
    let job: Job<SyncJob>;
    try {
      job = await this.queue.add('sync-menu', { tenantId }, { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 100, removeOnFail: 100 });
    } catch (error) {
      await this.setState(tenantId, { status: 'FAILED', startedAt: null, completedAt: new Date().toISOString(), error: 'Не удалось поставить задачу синхронизации в очередь' });
      throw error;
    }
    return { jobId: job.id!, status: 'PENDING' };
  }

  async getSyncStatus() {
    const value = await this.state(this.requireTenant());
    return value ? { status: value.status ?? null, startedAt: value.startedAt ?? null, completedAt: value.completedAt ?? null, error: value.error ?? null } : { status: null, startedAt: null, completedAt: null, error: null };
  }

  private async process(job: Job<SyncJob>): Promise<void> {
    const { tenantId } = job.data;
    await this.setState(tenantId, { status: 'RUNNING', startedAt: new Date().toISOString(), completedAt: null, error: null, jobId: job.id });
    const db = this.prisma.forTenant(tenantId);
    const record = await db.posIntegrationConfig.findFirst({ where: { provider: PosProvider.IIKO } });
    if (!record) throw new Error('Не найдена конфигурация iiko');
    const credentials = record.config as unknown as Credentials;
    const nomenclature = await this.requestNomenclature(credentials);
    const categories = Array.isArray(nomenclature.groups) ? nomenclature.groups as Array<{ id: string; name: string }> : [];
    const products = Array.isArray(nomenclature.products) ? nomenclature.products as Product[] : [];
    if (!Array.isArray(nomenclature.products)) throw new Error('iiko вернул некорректный список товаров');
    const ids = products.map((product) => product.id).filter(Boolean);
    await this.prisma.transactionForTenant(tenantId, async (tx) => {
      for (const category of categories) {
        if (!category.id || !category.name) continue;
        const existing = await tx.menuCategory.findFirst({ where: { tenantId, posCategoryId: category.id } });
        if (existing) await tx.menuCategory.update({ where: { id: existing.id }, data: { name: category.name, isActive: true } });
        else await tx.menuCategory.create({ data: { tenantId, name: category.name, sortOrder: 0, posCategoryId: category.id } });
      }
      for (const product of products) {
        if (!product.id || !product.name || !Number.isFinite(product.price) || (product.price ?? -1) < 0) continue;
        const categoryId = product.categoryId ?? null;
        let category = categoryId ? await tx.menuCategory.findFirst({ where: { tenantId, posCategoryId: categoryId } }) : null;
        if (!category) category = await tx.menuCategory.create({ data: { tenantId, name: product.categoryName || 'Меню iiko', sortOrder: 0, posCategoryId: categoryId } });
        const data = { name: product.name, priceByn: product.price!, imageUrl: product.image ?? null, categoryId: category.id, posItemId: product.id, isActive: true };
        const existing = await tx.menuItem.findFirst({ where: { tenantId, posItemId: product.id } });
        if (existing) await tx.menuItem.update({ where: { id: existing.id }, data });
        else await tx.menuItem.create({ data: { tenantId, ...data } });
      }
      await tx.menuItem.updateMany({ where: { tenantId, posItemId: { not: null, notIn: ids } }, data: { isActive: false } });
    });
    await this.setState(tenantId, { status: 'SUCCESS', startedAt: (await this.state(tenantId))?.startedAt, completedAt: new Date().toISOString(), error: null, jobId: job.id });
  }

  private async requestNomenclature(credentials: Credentials): Promise<Record<string, unknown>> {
    const base = credentials.base_url ?? 'https://api-ru.iiko.services';
    const loginResponse = await fetch(`${base}/api/0/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: credentials.login, password: this.decrypt(credentials.password_encrypted) }) });
    if (!loginResponse.ok) throw new ServiceUnavailableException(`Ошибка аутентификации iiko: HTTP ${loginResponse.status}`);
    const auth = await loginResponse.json() as { token?: string; authToken?: string };
    const token = auth.authToken ?? auth.token;
    if (!token) throw new Error('iiko не вернул authToken');
    const response = await fetch(`${base}/api/0/nomenclature/${encodeURIComponent(credentials.concept_id)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new ServiceUnavailableException(`Ошибка получения меню iiko: HTTP ${response.status}`);
    return await response.json() as Record<string, unknown>;
  }

  private decrypt(value: string): string {
    const key = Buffer.from(process.env.POS_CREDENTIALS_KEY ?? '', 'base64');
    if (key.length !== 32) throw new Error('POS_CREDENTIALS_KEY должен содержать AES-256 ключ в base64');
    const [iv, tag, ciphertext] = value.split(':').map((part) => Buffer.from(part, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  private async state(tenantId: string): Promise<Record<string, unknown> | null> {
    const row = await this.prisma.forTenant(tenantId).tenant.findUnique({ where: { id: tenantId }, select: { posImportState: true } });
    return row?.posImportState as Record<string, unknown> | null;
  }
  private async setState(tenantId: string, value: Record<string, unknown>) {
    await this.prisma.forTenant(tenantId).tenant.update({ where: { id: tenantId }, data: { posImportState: value } });
  }
  private requireTenant(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new BadRequestException('Не удалось определить тенант');
    return tenantId;
  }
}
