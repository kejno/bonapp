import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceMode } from '@prisma/client';
import {
  encryptCredentials,
  isEncryptedCredentials,
  PaymentCredentialInput,
  PaymentGateway,
  validateCredentials,
} from './payment-credentials';
import { TenantContextService } from './tenant-context.service';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

@Injectable()
export class TenantService {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
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
    const key = `tenants/${tenant.id}/logos/${randomUUID()}.${ext}`;
    const url = await this.storage.upload(key, file.buffer, file.mimetype);
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

  private validateLogoUrl(tenantId: string, logoUrl: string): void {
    const keyPrefix = `tenants/${tenantId}/logos/`;
    const fileName = logoUrl.split('/').pop() ?? '';
    if (
      !this.storage.isPublicUrlForKeyPrefix(logoUrl, keyPrefix) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|svg)$/i.test(
        fileName,
      )
    ) {
      throw new BadRequestException('Invalid logo URL');
    }
  }

  async saveOnboardingStep1(tenantId: string, data: {
    name: string; slug: string; legalName: string; unp: string; address: string;
    brandColor: string; logoUrl?: string;
  }) {
    if (!data.name?.trim() || !data.legalName?.trim() || !data.address?.trim()) {
      throw new BadRequestException('Название, юридическое наименование и адрес обязательны');
    }
    if (!/^#[\da-f]{6}$/i.test(data.brandColor)) {
      throw new BadRequestException('Некорректный цвет бренда');
    }
    if (data.logoUrl) this.validateLogoUrl(tenantId, data.logoUrl);
    if (!/^[a-z0-9-]{3,50}$/.test(data.slug)) {
      throw new ConflictException('Некорректный адрес заведения');
    }
    if (!/^\d{9}$/.test(data.unp)) {
      throw new ConflictException('УНП должен содержать 9 цифр');
    }
    if (!(await this.isSlugAvailable(data.slug, tenantId))) {
      throw new ConflictException({ code: 'SLUG_TAKEN', message: 'Этот адрес уже занят' });
    }
    try {
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
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw new ConflictException({ code: 'SLUG_TAKEN', message: 'Этот адрес уже занят' });
      }
      throw error;
    }
  }

  async getSettings(tenantId: string) {
    const tenant = await this.prisma.db.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);
    return {
      name: tenant.name,
      slug: tenant.slug,
      address: tenant.address,
      unp: tenant.unp,
      legalName: tenant.legalName,
      logoUrl: tenant.logoUrl,
      brandColor: tenant.brandColor ?? '#e0533c',
      serviceMode: tenant.serviceMode,
    };
  }

  async updateSettings(
    tenantId: string,
    settings: {
      name: string;
      address: string | null;
      unp: string | null;
      legalName: string | null;
      logoUrl: string | null;
      brandColor: string;
      serviceMode: ServiceMode;
    },
  ) {
    if (settings.logoUrl !== null) {
      this.validateLogoUrl(tenantId, settings.logoUrl);
    }
    const tenant = await this.prisma.db.tenant.update({
      where: { id: tenantId },
      data: settings,
      select: {
        id: true,
        name: true,
        slug: true,
        address: true,
        unp: true,
        legalName: true,
        logoUrl: true,
        brandColor: true,
        serviceMode: true,
      },
    });
    return { ...tenant, brandColor: tenant.brandColor ?? '#e0533c' };
  }

  async getGuestConfig(tenantId: string) {
    const tenant = await this.prisma.db.tenant.findUnique({
      where: { id: tenantId },
      select: { logoUrl: true, brandColor: true, serviceMode: true },
    });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);
    return { ...tenant, brandColor: tenant.brandColor ?? '#e0533c' };
  }
  async getPaymentGatewayStatuses(): Promise<Record<PaymentGateway, boolean>> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new Error('Tenant context is required');
    const tenant = await this.prisma.db.tenant.findUnique({
      where: { id: tenantId },
      select: { paymentCredentials: true },
    });
    const credentials = tenant?.paymentCredentials as Record<
      string,
      unknown
    > | null;
    return {
      oplati: isEncryptedCredentials(credentials?.oplati),
      erip: isEncryptedCredentials(credentials?.erip),
      bepaid: isEncryptedCredentials(credentials?.bepaid),
      skno: isEncryptedCredentials(credentials?.skno),
    };
  }

  async savePaymentCredentials(
    input: unknown,
  ): Promise<Record<PaymentGateway, boolean>> {
    let credentials: PaymentCredentialInput;
    try {
      credentials = validateCredentials(input);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Некорректные реквизиты',
      );
    }
    const secret = process.env.PAYMENT_CREDENTIALS_SECRET;
    if (!secret)
      throw new Error('PAYMENT_CREDENTIALS_SECRET is not configured');
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new Error('Tenant context is required');
    const tenant = await this.prisma.db.tenant.findUnique({
      where: { id: tenantId },
      select: { paymentCredentials: true },
    });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);
    const encrypted = encryptCredentials(credentials, secret);
    await this.prisma.transactionForTenant(
      tenantId,
      (tx) =>
        tx.$executeRaw`UPDATE "tenants"
        SET "payment_credentials" = jsonb_set(
          COALESCE("payment_credentials", '{}'::jsonb),
          ARRAY[${credentials.gateway}],
          ${JSON.stringify(encrypted)}::jsonb,
          true
        )
        WHERE "id" = ${tenantId}`,
    );
    return this.getPaymentGatewayStatuses();
  }
}
