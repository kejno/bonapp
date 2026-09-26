import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from './tenant-context.service';

const mockStorageService = {
  upload: jest.fn(),
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
      mockPrismaService.db.tenant.update.mockResolvedValue({});

      await service.uploadLogo(tenantId, file);

      expect(mockStorageService.upload).toHaveBeenCalledWith(
        'tenants/tenant-uuid/logo.png',
        file.buffer,
        'image/png',
      );
    });

    it('uses the tenant returned by the scoped lookup for the storage key', async () => {
      mockPrismaService.db.tenant.findUnique.mockResolvedValue({
        id: 'tenant-from-context',
        name: 'Test Tenant',
      });
      mockStorageService.upload.mockResolvedValue('url');
      mockPrismaService.db.tenant.update.mockResolvedValue({});

      await service.uploadLogo('untrusted-tenant-id', file);

      expect(mockStorageService.upload).toHaveBeenCalledWith(
        'tenants/tenant-from-context/logo.png',
        file.buffer,
        'image/png',
      );
      expect(mockPrismaService.db.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tenant-from-context' },
        data: { logoUrl: 'url' },
      });
    });

    it('should persist logoUrl to database', async () => {
      const url = 'http://s3/bucket/tenants/tenant-uuid/logo.png';
      mockStorageService.upload.mockResolvedValue(url);
      mockPrismaService.db.tenant.update.mockResolvedValue({});

      await service.uploadLogo(tenantId, file);

      expect(mockPrismaService.db.tenant.update).toHaveBeenCalledWith({
        where: { id: tenantId },
        data: { logoUrl: url },
      });
    });

    it('should return the public URL', async () => {
      const url = 'http://s3/bucket/tenants/tenant-uuid/logo.png';
      mockStorageService.upload.mockResolvedValue(url);
      mockPrismaService.db.tenant.update.mockResolvedValue({});

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
      mockPrismaService.db.tenant.update.mockResolvedValue({});

      await service.uploadLogo(tenantId, webpFile);

      expect(mockStorageService.upload).toHaveBeenCalledWith(
        'tenants/tenant-uuid/logo.webp',
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

  describe('payment credentials', () => {
    it('persists encrypted gateway credentials and returns status without exposing secrets', async () => {
      process.env.PAYMENT_CREDENTIALS_SECRET = 'test-secret';
      const persisted: Record<string, unknown>[] = [];
      mockPrismaService.db.tenant.findUnique.mockResolvedValue({
        paymentCredentials: null,
      });
      mockPrismaService.db.tenant.update.mockImplementation(
        ({
          data,
        }: {
          data: { paymentCredentials: Record<string, unknown> };
        }) => {
          persisted.push(data.paymentCredentials);
          mockPrismaService.db.tenant.findUnique.mockResolvedValue({
            paymentCredentials: data.paymentCredentials,
          });
          return Promise.resolve({});
        },
      );

      const result = await service.savePaymentCredentials({
        gateway: 'oplati',
        merchantId: 'secret-merchant',
      });

      const saved = persisted[0];
      expect(JSON.stringify(saved)).not.toContain('secret-merchant');
      expect(result).toEqual({
        oplati: true,
        erip: false,
        bepaid: false,
        skno: false,
      });
      delete process.env.PAYMENT_CREDENTIALS_SECRET;
    });
  });
});
