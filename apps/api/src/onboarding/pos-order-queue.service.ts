import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { buildIikoOrderPayload, buildRKeeperOrderPayload } from './pos-order';
import { PosOrderDispatcher } from './pos-order-dispatcher';
import { requestPosOrder } from './pos-network';
import { recoverPendingPosOrders } from './pos-order-recovery';

interface PosOrderJob { tenantId: string; orderId: string }

@Injectable()
export class PosOrderQueueService extends PosOrderDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PosOrderQueueService.name);
  private readonly queue: Queue<PosOrderJob>;
  private readonly worker: Worker<PosOrderJob>;
  private readonly allowedPosHosts: string;
  private recoveryTimer?: NodeJS.Timeout;
  private recovering = false;

  constructor(private readonly prisma: PrismaService, config: ConfigService) {
    super();
    this.allowedPosHosts = config.get<string>('POS_ALLOWED_HOSTS', '');
    const connection = {
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: Number(config.get<string>('REDIS_PORT', '6379')),
    };
    this.queue = new Queue<PosOrderJob>('pos-order-submit', { connection });
    this.worker = new Worker<PosOrderJob>('pos-order-submit', (job) => this.process(job), {
      connection,
      concurrency: 5,
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error(`Не удалось отправить заказ ${job?.data.orderId ?? 'unknown'} в POS`, error.stack);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.worker.waitUntilReady();
    this.recoveryTimer = setInterval(() => void this.recoverPendingOrders(), 30_000);
    this.recoveryTimer.unref();
    await this.recoverPendingOrders();
  }
  async onModuleDestroy(): Promise<void> {
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    await this.worker.close();
    await this.queue.close();
  }

  async enqueue(tenantId: string, orderId: string): Promise<void> {
    try {
      await this.addOrderJob(tenantId, orderId);
    } catch (error) {
      this.logger.error(`Не удалось поставить заказ ${orderId} в очередь POS`, error instanceof Error ? error.stack : undefined);
    }
  }

  private async recoverPendingOrders(): Promise<void> {
    if (this.recovering) return;
    this.recovering = true;
    try {
      await recoverPendingPosOrders(this.prisma, (tenantId, orderId) => this.addOrderJob(tenantId, orderId));
    } catch (error) {
      this.logger.error('Не удалось восстановить очередь отправки заказов в POS', error instanceof Error ? error.stack : undefined);
    } finally {
      this.recovering = false;
    }
  }

  private async addOrderJob(tenantId: string, orderId: string): Promise<void> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.queue.add('submit-order', { tenantId, orderId }, {
          jobId: `pos-order-${tenantId}-${orderId}`,
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Истекло время постановки заказа в очередь POS')), 5000);
          timeout.unref();
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async process(job: Job<PosOrderJob>): Promise<void> {
    const { tenantId, orderId } = job.data;
    const db = this.prisma.forTenant(tenantId);
    const [tenant, order] = await Promise.all([
      db.tenant.findUnique({ where: { id: tenantId }, select: { posType: true, posApiKey: true, posUrl: true } }),
      db.order.findFirst({
        where: { id: orderId },
        select: {
          id: true,
          dailyOrderNumber: true,
          comment: true,
          totalAmountByn: true,
          posOrderId: true,
          items: { select: { itemId: true, quantity: true, unitPriceByn: true } },
        },
      }),
    ]);
    if (!tenant?.posUrl || !tenant.posApiKey || !tenant.posType || tenant.posType === 'none') return;
    if (!order) throw new Error('Заказ не найден');
    if (order.posOrderId) return;
    if (!['r_keeper', 'iiko'].includes(tenant.posType)) throw new Error(`Отправка заказов для POS ${tenant.posType} не реализована`);

    const menuItems = await db.menuItem.findMany({
      where: { id: { in: order.items.map((item) => item.itemId) } },
      select: { id: true, posItemId: true },
    });
    const posIds = new Map(menuItems.map((item) => [item.id, item.posItemId]));
    const items = order.items.map((item) => {
      const posItemId = posIds.get(item.itemId);
      if (!posItemId) throw new Error(`У позиции меню ${item.itemId} не задан pos_item_id`);
      return { posItemId, quantity: item.quantity, unitPriceByn: Number(item.unitPriceByn) };
    });
    const orderData = {
        id: order.id,
        dailyOrderNumber: order.dailyOrderNumber,
        comment: order.comment,
        totalAmountByn: Number(order.totalAmountByn),
        items,
      };
    let externalId: string;
    if (tenant.posType === 'r_keeper') {
      externalId = await requestPosOrder(new URL(tenant.posUrl), tenant.posApiKey, this.allowedPosHosts, 15000, buildRKeeperOrderPayload(orderData));
    } else {
      let credentials: { apiKey?: string; organizationId?: string; terminalGroupId?: string };
      try { credentials = JSON.parse(tenant.posApiKey) as typeof credentials; }
      catch { throw new Error('Для iiko укажите JSON с apiKey, organizationId и terminalGroupId'); }
      if (!credentials.apiKey || !credentials.organizationId || !credentials.terminalGroupId) {
        throw new Error('Для iiko укажите apiKey, organizationId и terminalGroupId');
      }
      externalId = await requestPosOrder(new URL(tenant.posUrl), credentials.apiKey, this.allowedPosHosts, 15000,
        buildIikoOrderPayload(orderData, credentials.organizationId, credentials.terminalGroupId), '/api/1/order/create', 'orderInfo.id');
    }
    await db.order.update({ where: { id_tenantId: { id: orderId, tenantId } }, data: { posOrderId: externalId } });
  }
}
