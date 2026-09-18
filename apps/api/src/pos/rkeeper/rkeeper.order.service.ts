import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RKeeperClientFactory } from './rkeeper.client-factory';

@Injectable()
export class RKeeperOrderService {
  private readonly logger = new Logger(RKeeperOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientFactory: RKeeperClientFactory,
  ) {}

  async sendOrder(tenantId: string, orderId: string): Promise<void> {
    const connector = await this.prisma.posConnector.findFirst({
      where: { tenantId, posType: 'RKEEPER', isActive: true },
    });
    if (!connector) {
      this.logger.warn(
        `No active r_keeper connector for tenant ${tenantId}, skipping order ${orderId}`,
      );
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { menuItem: true } } },
    });
    if (!order) {
      this.logger.error(`Order ${orderId} not found`);
      return;
    }

    const itemsWithoutPosId = order.items.filter((i) => !i.menuItem.posItemId);
    if (itemsWithoutPosId.length > 0) {
      this.logger.warn(
        `Order ${orderId} has ${itemsWithoutPosId.length} item(s) without posItemId`,
      );
    }

    const sendableItems = order.items.filter((i) => i.menuItem.posItemId);
    if (sendableItems.length === 0) {
      this.logger.error(`Order ${orderId} has no sendable items, aborting`);
      return;
    }

    const client = this.clientFactory.create({
      baseUrl: connector.baseUrl,
      username: connector.username,
      password: connector.passwordEncrypted,
    });

    try {
      const result = await client.createOrder({
        items: sendableItems.map((i) => ({
          productId: i.menuItem.posItemId!,
          amount: i.quantity,
          price: Number(i.price),
        })),
      });
      await this.prisma.order.update({
        where: { id: orderId },
        data: { posOrderId: result.id, status: 'SENT_TO_POS' },
      });
      this.logger.log(`Order ${orderId} sent to r_keeper as pos order ${result.id}`);
    } catch (err) {
      this.logger.error(
        `Failed to send order ${orderId} to r_keeper: ${(err as Error).message}`,
      );
      // Order stays in Bonapp regardless of POS failure
    }
  }
}
