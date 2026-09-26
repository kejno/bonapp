import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
    const tenant = await this.prisma.db.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);

    const ext = MIME_TO_EXT[file.mimetype] ?? 'jpg';
    const key = `tenants/${tenant.id}/logo.${ext}`;
    const url = await this.storage.upload(key, file.buffer, file.mimetype);
    await this.prisma.db.tenant.update({
      where: { id: tenant.id },
      data: { logoUrl: url },
    });
    return url;
  }

  async isSlugAvailable(slug: string, tenantId: string): Promise<boolean> {
    const existing = await this.prisma.db.tenant.findUnique({ where: { slug } });
    return !existing || existing.id === tenantId;
  }

  async createLogoUpload(tenantId: string, contentType: string) {
    const tenant = await this.prisma.db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);
    const extension = MIME_TO_EXT[contentType];
    if (!extension) throw new ConflictException('Unsupported logo format');
    return this.storage.getPresignedUploadUrl(
      `tenants/${tenant.id}/logo.${extension}`,
      contentType,
    );
  }

  async saveOnboardingStep1(tenantId: string, data: {
    name: string; slug: string; legalName: string; unp: string; address: string;
    brandColor: string; logoUrl?: string;
  }) {
    if (!/^[a-z0-9-]{3,50}$/.test(data.slug)) {
      throw new ConflictException('Некорректный адрес заведения');
    }
    if (!/^\d{9}$/.test(data.unp)) {
      throw new ConflictException('УНП должен содержать 9 цифр');
    }
    if (!(await this.isSlugAvailable(data.slug, tenantId))) {
      throw new ConflictException({ code: 'SLUG_TAKEN', message: 'Этот адрес уже занят' });
    }
    const tenant = await this.prisma.db.tenant.update({
      where: { id: tenantId },
      data: {
        name: data.name.trim(), slug: data.slug, legalName: data.legalName.trim(),
        unp: data.unp, address: data.address.trim(), brandColor: data.brandColor,
        timezone: 'Europe/Minsk', ...(data.logoUrl ? { logoUrl: data.logoUrl } : {}),
      },
      select: { id: true, slug: true },
    });
    return tenant;
  }
}
