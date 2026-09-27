import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from './tenant-context.service';

const mockStorageService = {
  upload: jest.fn(),
  isPublicUrlForKeyPrefix: jest.fn(),
  getPresignedUploadUrl: jest.fn(),
};

const mockPrismaService = {
  transactionForTenant: jest.fn(),
  db: {
    tenant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
};

describe('TenantService', () => {
  let service: TenantService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        { provide: StorageService, useValue: mockStorageService },
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: TenantContextService,
          useValue: { getTenantId: () => 'tenant-uuid' },
        },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadLogo', () => {
    const tenantId = 'tenant-uuid';
    const file = {
      originalname: 'logo.png',
      buffer: Buffer.from('img'),
      mimetype: 'image/png',
    } as Express.Multer.File;

    beforeEach(() => {
      mockPrismaService.db.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Tenant',
      });
    });

    it('should upload file to storage with correct key', async () => {
      mockStorageService.upload.mockResolvedValue(
        'http://s3/bucket/tenants/tenant-uuid/logo.png',
      );

      await service.uploadLogo(tenantId, file);

      expect(mockStorageService.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^tenants\/tenant-uuid\/logos\/[0-9a-f-]+\.png$/),
        file.buffer,
        'image/png',
      );
    });

    it('uploads successive logos to distinct keys so an unsaved upload cannot replace the published logo', async () => {
      mockStorageService.upload.mockResolvedValue('url');

      await service.uploadLogo(tenantId, file);
      const firstKey = (
        mockStorageService.upload.mock.calls as unknown as [
          string,
          Buffer,
          string,
        ][]
      )[0][0];
      await service.uploadLogo(tenantId, file);
      const secondKey = (
        mockStorageService.upload.mock.calls as unknown as [
          string,
          Buffer,
          string,
        ][]
      )[1][0];

      expect(firstKey).not.toBe(secondKey);
    });

    it('uses the tenant returned by the scoped lookup for the storage key', async () => {
      mockPrismaService.db.tenant.findUnique.mockResolvedValue({
        id: 'tenant-from-context',
        name: 'Test Tenant',
      });
      mockStorageService.upload.mockResolvedValue('url');
      mockStorageService.isPublicUrlForKeyPrefix.mockReturnValue(true);

      await service.uploadLogo('untrusted-tenant-id', file);

      expect(mockStorageService.upload).toHaveBeenCalledWith(
        expect.stringMatching(
          /^tenants\/tenant-from-context\/logos\/[0-9a-f-]+\.png$/,
        ),
        file.buffer,
        'image/png',
      );
      expect(mockPrismaService.db.tenant.update).not.toHaveBeenCalled();
    });

    it('does not persist a logo until the settings form is saved', async () => {
      mockStorageService.upload.mockResolvedValue('url');
      await service.uploadLogo(tenantId, file);
      expect(mockPrismaService.db.tenant.update).not.toHaveBeenCalled();
    });

    it('should return the public URL', async () => {
      const url = 'http://s3/bucket/tenants/tenant-uuid/logo.png';
      mockStorageService.upload.mockResolvedValue(url);

      const result = await service.uploadLogo(tenantId, file);

      expect(result).toBe(url);
    });

    it('should derive key extension from mimetype, not original filename', async () => {
      const webpFile = {
        originalname: 'brand.gif',
        buffer: Buffer.from('img'),
        mimetype: 'image/webp',
      } as Express.Multer.File;

      mockStorageService.upload.mockResolvedValue('url');
      await service.uploadLogo(tenantId, webpFile);

      expect(mockStorageService.upload).toHaveBeenCalledWith(
        expect.stringMatching(
          /^tenants\/tenant-uuid\/logos\/[0-9a-f-]+\.webp$/,
        ),
        expect.any(Buffer),
        'image/webp',
      );
    });

    it('should propagate storage errors', async () => {
      mockStorageService.upload.mockRejectedValue(new Error('upload failed'));

      await expect(service.uploadLogo(tenantId, file)).rejects.toThrow(
        'upload failed',
      );
    });

    describe('tenant not found', () => {
      beforeEach(() => {
        mockPrismaService.db.tenant.findUnique.mockResolvedValue(null);
      });

      it('should throw NotFoundException when tenant does not exist', async () => {
        await expect(service.uploadLogo(tenantId, file)).rejects.toThrow(
          NotFoundException,
        );
      });

      it('should not upload to S3 when tenant does not exist', async () => {
        await expect(service.uploadLogo(tenantId, file)).rejects.toThrow(
          NotFoundException,
        );

        expect(mockStorageService.upload).not.toHaveBeenCalled();
      });
    });
  });

  describe('createLogoUpload', () => {
    it('creates a unique versioned upload key accepted by settings validation', async () => {
      mockPrismaService.db.tenant.findUnique.mockResolvedValue({ id: 'tenant-uuid' });
      mockStorageService.getPresignedUploadUrl.mockImplementation((key: string) => Promise.resolve({ publicUrl: `https://cdn/bucket/${key}` }));
      mockStorageService.isPublicUrlForKeyPrefix.mockReturnValue(true);
      mockPrismaService.db.tenant.update.mockResolvedValue({
        id: 'tenant-uuid', name: 'Cafe', slug: 'cafe', brandColor: '#123456',
        logoUrl: 'https://cdn/bucket/tenants/tenant-uuid/logos/123e4567-e89b-42d3-a456-426614174000.png',
        serviceMode: 'VIEW_ONLY',
      });

      const upload = await service.createLogoUpload('tenant-uuid', 'image/png');
      mockPrismaService.db.tenant.update.mockResolvedValue({
        id: 'tenant-uuid', name: 'Cafe', slug: 'cafe', brandColor: '#123456',
        logoUrl: upload.publicUrl, serviceMode: 'VIEW_ONLY',
      });

      expect(mockStorageService.getPresignedUploadUrl).toHaveBeenCalledWith(
        expect.stringMatching(/^tenants\/tenant-uuid\/logos\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/),
        'image/png',
      );
      await expect(service.updateSettings('tenant-uuid', {
        name: 'Cafe', address: null, unp: null, legalName: null,
        brandColor: '#123456', logoUrl: upload.publicUrl, serviceMode: 'VIEW_ONLY',
      })).resolves.toMatchObject({ logoUrl: upload.publicUrl });
    });
  });

  describe('payment credentials', () => {
    it('preserves credentials from concurrent saves to different gateways', async () => {
      process.env.PAYMENT_CREDENTIALS_SECRET = 'test-secret';
      const credentials: Record<string, unknown> = {};
      mockPrismaService.db.tenant.findUnique.mockImplementation(() => ({
        paymentCredentials: { ...credentials },
      }));
      mockPrismaService.transactionForTenant.mockImplementation(
        (_tenantId: string, operation: (tx: unknown) => Promise<void>) =>
          operation({
            $executeRaw: (
              parts: TemplateStringsArray,
              ...values: unknown[]
            ) => {
              expect(parts.join('?')).toContain('jsonb_set');
              credentials[String(values[0])] = JSON.parse(String(values[1]));
              return Promise.resolve(1);
            },
          }),
      );

      const [oplati, erip] = await Promise.all([
        service.savePaymentCredentials({
          gateway: 'oplati',
          merchantId: 'merchant-1',
        }),
        service.savePaymentCredentials({
          gateway: 'erip',
          serviceId: 'service-1',
          secret: 'secret-1',
        }),
      ]);

      expect(oplati).toEqual({
        oplati: true,
        erip: true,
        bepaid: false,
        skno: false,
      });
      expect(erip).toEqual({
        oplati: true,
        erip: true,
        bepaid: false,
        skno: false,
      });
      expect(mockPrismaService.transactionForTenant).toHaveBeenCalledTimes(2);
      delete process.env.PAYMENT_CREDENTIALS_SECRET;
    });
  });

  describe('saveOnboardingStep1', () => {
    const validProfile = {
      name: 'Кафе', slug: 'cafe', legalName: 'ООО Кафе', unp: '123456789',
      address: 'Минск', brandColor: '#e0533c',
    };

    beforeEach(() => {
      mockPrismaService.db.tenant.findUnique.mockResolvedValue(null);
      mockPrismaService.db.tenant.update.mockResolvedValue({ id: 'tenant-uuid', slug: 'cafe' });
    });

    it.each([
      ['name', { ...validProfile, name: '   ' }],
      ['legal name', { ...validProfile, legalName: '   ' }],
      ['address', { ...validProfile, address: '   ' }],
    ])('rejects an empty required %s before saving', async (_field, profile) => {
      await expect(service.saveOnboardingStep1('tenant-uuid', profile)).rejects.toThrow();
      expect(mockPrismaService.db.tenant.update).not.toHaveBeenCalled();
    });

    it.each(['red', '#12345', '#1234567'])('rejects invalid brand color %s', async (brandColor) => {
      await expect(service.saveOnboardingStep1('tenant-uuid', { ...validProfile, brandColor })).rejects.toThrow();
      expect(mockPrismaService.db.tenant.update).not.toHaveBeenCalled();
    });

    it('maps a unique slug race from Prisma to the same SLUG_TAKEN conflict', async () => {
      mockPrismaService.db.tenant.update.mockRejectedValue({ code: 'P2002' });
      await expect(service.saveOnboardingStep1('tenant-uuid', validProfile)).rejects.toMatchObject({
        response: { code: 'SLUG_TAKEN', message: 'Этот адрес уже занят' },
      });
    });
  });

  describe('updateSettings', () => {
    it('rejects a logo URL outside the current tenant storage namespace', async () => {
      mockStorageService.isPublicUrlForKeyPrefix.mockReturnValue(false);
      await expect(
        service.updateSettings('tenant-uuid', {
          name: 'Cafe',
          address: null,
          unp: null,
          legalName: null,
          brandColor: '#123456',
          logoUrl: 'https://attacker.example/logo.png',
          serviceMode: 'VIEW_ONLY',
        }),
      ).rejects.toThrow('Invalid logo URL');
      expect(mockPrismaService.db.tenant.update).not.toHaveBeenCalled();
    });

    it('persists only a URL for a versioned logo belonging to the current tenant', async () => {
      mockStorageService.isPublicUrlForKeyPrefix.mockReturnValue(true);
      mockPrismaService.db.tenant.update.mockResolvedValue({
        id: 'tenant-uuid',
        slug: 'cafe',
        name: 'Cafe',
        logoUrl:
          'https://cdn/bucket/tenants/tenant-uuid/logos/123e4567-e89b-42d3-a456-426614174000.png',
        brandColor: '#123456',
        serviceMode: 'VIEW_ONLY',
      });
      const logoUrl =
        'https://cdn/bucket/tenants/tenant-uuid/logos/123e4567-e89b-42d3-a456-426614174000.png';

      const result = await service.updateSettings('tenant-uuid', {
        name: 'Cafe',
        address: null,
        unp: null,
        legalName: null,
        brandColor: '#123456',
        logoUrl,
        serviceMode: 'VIEW_ONLY',
      });

      expect(mockStorageService.isPublicUrlForKeyPrefix).toHaveBeenCalledWith(
        logoUrl,
        'tenants/tenant-uuid/logos/',
      );
      expect(result.logoUrl).toBe(logoUrl);
    });

    it('updates only editable profile, branding, legal and service mode fields for the current tenant', async () => {
      const settings = {
        name: 'Cafe',
        address: 'Minsk',
        unp: '123456789',
        legalName: 'Cafe LLC',
        brandColor: '#123456',
        logoUrl:
          'https://cdn/bucket/tenants/tenant-uuid/logos/123e4567-e89b-42d3-a456-426614174000.png',
        serviceMode: 'VIEW_ONLY' as const,
      };
      mockStorageService.isPublicUrlForKeyPrefix.mockReturnValue(true);
      mockPrismaService.db.tenant.update.mockResolvedValue({
        id: 'tenant-uuid',
        slug: 'cafe',
        ...settings,
      });

      await service.updateSettings('tenant-uuid', settings);

      expect(mockPrismaService.db.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tenant-uuid' },
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
    });
  });
});
