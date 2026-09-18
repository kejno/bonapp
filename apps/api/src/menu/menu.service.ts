import { Injectable, Logger } from '@nestjs/common';
import { MENU_CACHE_TTL_SECONDS, menuCacheKey } from '../cache/cache.constants';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MenuService {
  private readonly logger = new Logger(MenuService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getGuestMenu(tenantId: string) {
    const key = menuCacheKey(tenantId);
    const cached = await this.readCachedMenu(key);
    if (cached !== null) {
      return cached;
    }

    const menu = await this.prisma.menuCategory.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            modifierGroups: {
              orderBy: { sortOrder: 'asc' },
              include: {
                modifierGroup: {
                  include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
                },
              },
            },
            stopListItem: { select: { isStopped: true } },
          },
        },
      },
    });

    await this.writeCachedMenu(key, menu);
    return menu;
  }

  private async readCachedMenu(key: string): Promise<unknown[] | null> {
    try {
      return await this.cache.getJson<unknown[]>(key);
    } catch (error) {
      this.logCacheError('read', key, error);
      return null;
    }
  }

  private async writeCachedMenu(key: string, menu: unknown[]): Promise<void> {
    try {
      await this.cache.setJson(key, menu, MENU_CACHE_TTL_SECONDS);
    } catch (error) {
      this.logCacheError('write', key, error);
    }
  }

  private logCacheError(operation: string, key: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Unable to ${operation} menu cache ${key}: ${message}`);
  }
}
