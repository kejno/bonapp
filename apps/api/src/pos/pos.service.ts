import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PosQueueService } from './pos-queue.service';
import { RKeeperClientFactory } from './rkeeper/rkeeper.client-factory';
import { RKeeperMenuService } from './rkeeper/rkeeper.menu.service';
import { RKeeperOrderService } from './rkeeper/rkeeper.order.service';

export interface PosHealthResult {
  status: 'ok' | 'error' | 'unconfigured' | 'unsupported';
  posType?: string;
  latencyMs?: number;
}

@Injectable()
export class PosService {
  private readonly logger = new Logger(PosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: PosQueueService,
    private readonly rkeeperClientFactory: RKeeperClientFactory,
    private readonly rkeeperMenuService: RKeeperMenuService,
    private readonly rkeeperOrderService: RKeeperOrderService,
  ) {}

  async syncMenu(tenantId: string): Promise<string> {
    const jobId = await this.queue.addSyncMenuJob(tenantId);
    this.logger.log(`sync-menu job ${jobId} queued for tenant ${tenantId}`);
    return jobId;
  }

  async sendOrder(tenantId: string, orderId: string): Promise<string> {
    const jobId = await this.queue.addSendOrderJob(tenantId, orderId);
    this.logger.log(`send-order job ${jobId} queued for tenant ${tenantId}, order ${orderId}`);
    return jobId;
  }

  async getHealth(tenantId: string): Promise<PosHealthResult> {
    const connector = await this.prisma.posConnector.findFirst({
      where: { tenantId, isActive: true },
    });
    if (!connector) {
      return { status: 'unconfigured' };
    }
    if (connector.posType !== 'RKEEPER') {
      return { status: 'unsupported', posType: connector.posType };
    }

    const client = this.rkeeperClientFactory.create({
      baseUrl: connector.baseUrl,
      username: connector.username,
      password: connector.passwordEncrypted,
    });

    try {
      const latencyMs = await client.ping();
      return { status: 'ok', posType: connector.posType, latencyMs };
    } catch {
      return { status: 'error', posType: connector.posType };
    }
  }

  async dispatchSyncMenu(tenantId: string): Promise<void> {
    const connector = await this.prisma.posConnector.findFirst({
      where: { tenantId, isActive: true },
    });
    if (!connector) {
      this.logger.warn(`No active connector for tenant ${tenantId}, skipping menu sync`);
      return;
    }
    if (connector.posType === 'RKEEPER') {
      await this.rkeeperMenuService.importMenu(tenantId);
    } else {
      this.logger.warn(`POS type ${connector.posType} is not implemented for menu sync`);
    }
  }

  async dispatchSendOrder(tenantId: string, orderId: string): Promise<void> {
    const connector = await this.prisma.posConnector.findFirst({
      where: { tenantId, isActive: true },
    });
    if (!connector) {
      this.logger.warn(
        `No active connector for tenant ${tenantId}, skipping order ${orderId}`,
      );
      return;
    }
    if (connector.posType === 'RKEEPER') {
      await this.rkeeperOrderService.sendOrder(tenantId, orderId);
    } else {
      this.logger.warn(`POS type ${connector.posType} is not implemented for order dispatch`);
    }
  }
}
