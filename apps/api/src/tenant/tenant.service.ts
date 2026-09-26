import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
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
    const key = `tenants/${tenant.id}/logo.${ext}`;
    const url = await this.storage.upload(key, file.buffer, file.mimetype);
    await this.prisma.db.tenant.update({
      where: { id: tenant.id },
      data: { logoUrl: url },
    });
    return url;
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
    const stored = (tenant.paymentCredentials ?? {}) as Record<string, unknown>;
    stored[credentials.gateway] = encryptCredentials(credentials, secret);
    await this.prisma.db.tenant.update({
      where: { id: tenantId },
      data: { paymentCredentials: stored },
    });
    return this.getPaymentGatewayStatuses();
  }
}
