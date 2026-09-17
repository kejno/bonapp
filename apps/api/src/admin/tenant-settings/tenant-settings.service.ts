import { Injectable } from '@nestjs/common';
import { UpdateTenantSettingsDto } from '@bonapp/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async updateSettings(tenantId: string, dto: UpdateTenantSettingsDto): Promise<void> {
    await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: dto,
      create: { tenantId, ...dto },
    });
  }
}
