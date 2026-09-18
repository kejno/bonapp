import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PosCheckInput, PosClientService, PosType } from './pos-client.service';

export type SavePosSettingsInput =
  | { posType: 'none' }
  | { posType: PosType; apiKey: string; url?: string };

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posClient: PosClientService,
    private readonly importQueue: Queue,
  ) {}

  async savePosSettings(tenantId: string, input: SavePosSettingsInput) {
    await this.getTenant(tenantId);
    if (input.posType === 'none') {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { posType: 'none', posApiKey: null, posUrl: null },
      });
      return { posType: 'none' };
    }

    this.ensureCredentials(input);
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { posType: input.posType, posApiKey: input.apiKey, posUrl: input.url ?? null },
    });
    return { posType: input.posType };
  }

  async checkPos(tenantId: string, input: SavePosSettingsInput) {
    if (input.posType === 'none') {
      throw new BadRequestException('Для «Без POS» проверка подключения не требуется');
    }
    this.ensureCredentials(input);
    const result = await this.posClient.checkConnection(input as PosCheckInput);
    await this.savePosSettings(tenantId, input);
    return result;
  }

  async startImport(tenantId: string) {
    const tenant = await this.getTenant(tenantId);
    if (tenant.posType === 'none' || !tenant.posType || !tenant.posApiKey) {
      throw new BadRequestException('Сначала подключите POS-систему');
    }

    const previousImport = await this.prisma.menuImport.findFirst({
      where: { tenantId, status: 'completed' },
    });
    if (previousImport) {
      throw new BadRequestException('Меню уже импортировано');
    }

    const failedImport = await this.prisma.menuImport.findFirst({
      where: { tenantId, status: 'completed_with_errors' },
      orderBy: { createdAt: 'desc' },
    });

    const menuImport = await this.prisma.menuImport.create({
      data: { tenantId, status: 'queued' },
    });
    await this.importQueue.add(
      'menu-import',
      { tenantId, importId: menuImport.id, retryFailed: Boolean(failedImport) },
      { jobId: menuImport.id },
    );
    return menuImport;
  }

  async getImportProgress(tenantId: string) {
    const menuImport = await this.prisma.menuImport.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    if (!menuImport) {
      throw new NotFoundException('Импорт меню ещё не запускался');
    }
    return menuImport;
  }

  private async getTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Тенант не найден');
    }
    return tenant;
  }

  private ensureCredentials(input: Exclude<SavePosSettingsInput, { posType: 'none' }>) {
    if (!input.apiKey.trim()) {
      throw new BadRequestException('Укажите API-ключ POS-системы');
    }
    if (input.posType === 'r_keeper' && !input.url?.trim()) {
      throw new BadRequestException('Для r_keeper укажите URL API');
    }
  }
}
