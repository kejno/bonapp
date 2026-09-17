import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RKeeperClientFactory } from './rkeeper.client-factory';

@Injectable()
export class RKeeperMenuService {
  private readonly logger = new Logger(RKeeperMenuService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientFactory: RKeeperClientFactory,
  ) {}

  async importMenu(tenantId: string): Promise<void> {
    const connector = await this.prisma.posConnector.findFirst({
      where: { tenantId, posType: 'RKEEPER', isActive: true },
    });
    if (!connector) {
      this.logger.warn(`No active r_keeper connector for tenant ${tenantId}`);
      return;
    }

    const client = this.clientFactory.create({
      baseUrl: connector.baseUrl,
      username: connector.username,
      password: connector.passwordEncrypted,
    });

    let categories: Awaited<ReturnType<typeof client.getCategories>>;
    let products: Awaited<ReturnType<typeof client.getProducts>>;
    try {
      [categories, products] = await Promise.all([
        client.getCategories(),
        client.getProducts(),
      ]);
    } catch (err) {
      this.logger.error(
        `r_keeper menu import failed for tenant ${tenantId}: ${(err as Error).message}`,
      );
      throw err;
    }

    for (const cat of categories) {
      const existing = await this.prisma.menuCategory.findFirst({
        where: { tenantId, posCategoryId: cat.id },
      });
      if (existing) {
        await this.prisma.menuCategory.update({
          where: { id: existing.id },
          data: { name: cat.name },
        });
      } else {
        await this.prisma.menuCategory.create({
          data: { tenantId, name: cat.name, posCategoryId: cat.id },
        });
      }
    }

    const dbCategories = await this.prisma.menuCategory.findMany({
      where: { tenantId, posCategoryId: { not: null } },
    });
    const categoryMap = new Map<string, string>(
      dbCategories.map((c) => [c.posCategoryId!, c.id]),
    );

    const importedPosItemIds = new Set<string>();
    for (const product of products) {
      importedPosItemIds.add(product.id);
      const categoryId = product.categoryId
        ? (categoryMap.get(product.categoryId) ?? null)
        : null;

      const existing = await this.prisma.menuItem.findFirst({
        where: { tenantId, posItemId: product.id },
      });
      if (existing) {
        await this.prisma.menuItem.update({
          where: { id: existing.id },
          data: { name: product.name, price: product.price, isAvailable: true, categoryId },
        });
      } else {
        await this.prisma.menuItem.create({
          data: {
            tenantId,
            name: product.name,
            price: product.price,
            posItemId: product.id,
            isAvailable: true,
            categoryId,
          },
        });
      }
    }

    await this.prisma.menuItem.updateMany({
      where: {
        tenantId,
        posItemId: { not: null },
        NOT: { posItemId: { in: [...importedPosItemIds] } },
      },
      data: { isAvailable: false },
    });

    this.logger.log(
      `r_keeper import done for tenant ${tenantId}: ${categories.length} categories, ${products.length} items`,
    );
  }
}
