import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';

const mockStorageService = {
  upload: jest.fn(),
  isPublicUrlForKeyPrefix: jest.fn(),
};

const mockPrismaService = {
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
      mockPrismaService.db.tenant.findUnique.mockResolvedValue({ id: tenantId, name: 'Test Tenant' });
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
      const firstKey = (mockStorageService.upload.mock.calls as unknown as [string, Buffer, string][])[0][0];
      await service.uploadLogo(tenantId, file);
      const secondKey = (mockStorageService.upload.mock.calls as unknown as [string, Buffer, string][])[1][0];

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
        expect.stringMatching(/^tenants\/tenant-from-context\/logos\/[0-9a-f-]+\.png$/),
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
        expect.stringMatching(/^tenants\/tenant-uuid\/logos\/[0-9a-f-]+\.webp$/),
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

  describe('updateSettings', () => {
    it('rejects a logo URL outside the current tenant storage namespace', async () => {
      mockStorageService.isPublicUrlForKeyPrefix.mockReturnValue(false);
      await expect(service.updateSettings('tenant-uuid', {
        name: 'Cafe', address: null, unp: null, legalName: null,
        brandColor: '#123456', logoUrl: 'https://attacker.example/logo.png', serviceMode: 'VIEW_ONLY',
      })).rejects.toThrow('Invalid logo URL');
      expect(mockPrismaService.db.tenant.update).not.toHaveBeenCalled();
    });

    it('persists only a URL for a versioned logo belonging to the current tenant', async () => {
      mockStorageService.isPublicUrlForKeyPrefix.mockReturnValue(true);
      mockPrismaService.db.tenant.update.mockResolvedValue({ id: 'tenant-uuid', slug: 'cafe', name: 'Cafe', logoUrl: 'https://cdn/bucket/tenants/tenant-uuid/logos/123e4567-e89b-42d3-a456-426614174000.png', brandColor: '#123456', serviceMode: 'VIEW_ONLY' });
      const logoUrl = 'https://cdn/bucket/tenants/tenant-uuid/logos/123e4567-e89b-42d3-a456-426614174000.png';

      const result = await service.updateSettings('tenant-uuid', {
        name: 'Cafe', address: null, unp: null, legalName: null,
        brandColor: '#123456', logoUrl, serviceMode: 'VIEW_ONLY',
      });

      expect(mockStorageService.isPublicUrlForKeyPrefix).toHaveBeenCalledWith(
        logoUrl,
        'tenants/tenant-uuid/logos/',
      );
      expect(result.logoUrl).toBe(logoUrl);
    });

    it('updates only editable profile, branding, legal and service mode fields for the current tenant', async () => {
      const settings = {
        name: 'Cafe', address: 'Minsk', unp: '123456789', legalName: 'Cafe LLC',
        brandColor: '#123456', logoUrl: 'https://cdn/bucket/tenants/tenant-uuid/logos/123e4567-e89b-42d3-a456-426614174000.png', serviceMode: 'VIEW_ONLY' as const,
      };
      mockStorageService.isPublicUrlForKeyPrefix.mockReturnValue(true);
      mockPrismaService.db.tenant.update.mockResolvedValue({ id: 'tenant-uuid', slug: 'cafe', ...settings });

      await service.updateSettings('tenant-uuid', settings);

      expect(mockPrismaService.db.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tenant-uuid' },
        data: settings,
        select: { id: true, name: true, slug: true, address: true, unp: true, legalName: true, logoUrl: true, brandColor: true, serviceMode: true },
      });
    });
  });
});
