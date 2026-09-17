import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IikoAuthService } from './iiko-auth.service';
import { IikoNomenclatureService } from './iiko-nomenclature.service';
import { IikoConfig } from './iiko.types';

@Injectable()
export class IikoSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: IikoAuthService,
    private readonly nomenclatureService: IikoNomenclatureService,
  ) {}

  async syncForTenant(tenantId: string): Promise<void> {
    const posConfig = await this.prisma.posIntegrationConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider: 'IIKO' } },
    });

    if (!posConfig) {
      throw new Error(`No iiko integration configured for tenant ${tenantId}`);
    }

    const iikoConfig = posConfig.config as IikoConfig;
    const token = await this.authService.getToken(tenantId, iikoConfig);
    const nomenclature = await this.nomenclatureService.fetchNomenclature(
      iikoConfig.concept_id,
      token,
    );

    await this.prisma.$transaction(async (tx) => {
      const categoryIdMap = new Map<string, string>();

      for (const group of nomenclature.groups.filter((g) => !g.isDeleted)) {
        const category = await tx.menuCategory.upsert({
          where: { tenantId_posCategoryId: { tenantId, posCategoryId: group.id } },
          create: { tenantId, name: group.name, posCategoryId: group.id },
          update: { name: group.name },
        });
        categoryIdMap.set(group.id, category.id);
      }

      const activeIikoItemIds: string[] = [];

      for (const product of nomenclature.products.filter((p) => !p.isDeleted)) {
        const categoryId = product.groupId ? (categoryIdMap.get(product.groupId) ?? null) : null;
        const imageUrl = product.imageLinks?.[0] ?? null;

        await tx.menuItem.upsert({
          where: { tenantId_posItemId: { tenantId, posItemId: product.id } },
          create: {
            tenantId,
            name: product.name,
            price: product.price,
            imageUrl,
            posItemId: product.id,
            categoryId,
            isActive: true,
          },
          update: {
            name: product.name,
            price: product.price,
            imageUrl,
            categoryId,
            isActive: true,
          },
        });

        activeIikoItemIds.push(product.id);
      }

      await tx.menuItem.updateMany({
        where: {
          tenantId,
          AND: [
            { posItemId: { not: null } },
            { NOT: { posItemId: { in: activeIikoItemIds } } },
          ],
        },
        data: { isActive: false },
      });
    });
  }
}
