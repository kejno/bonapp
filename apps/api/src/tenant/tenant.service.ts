import { Injectable, NotFoundException } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class TenantService {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  async uploadLogo(
    tenantId: string,
    file: Express.Multer.File,
  ): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);

    const ext = MIME_TO_EXT[file.mimetype] ?? 'jpg';
    const key = `tenants/${tenantId}/logo.${ext}`;
    const url = await this.storage.upload(key, file.buffer, file.mimetype);
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { logoUrl: url },
    });
    return url;
  }
}
