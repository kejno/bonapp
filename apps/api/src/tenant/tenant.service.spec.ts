import { Test, TestingModule } from '@nestjs/testing';
import { TenantService } from './tenant.service';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';

const mockStorageService = {
  upload: jest.fn(),
};

const mockPrismaService = {
  tenant: {
    update: jest.fn(),
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

    it('should upload file to storage with correct key', async () => {
      mockStorageService.upload.mockResolvedValue(
        'http://s3/bucket/tenants/tenant-uuid/logo.png',
      );
      mockPrismaService.tenant.update.mockResolvedValue({});

      await service.uploadLogo(tenantId, file);

      expect(mockStorageService.upload).toHaveBeenCalledWith(
        'tenants/tenant-uuid/logo.png',
        file.buffer,
        'image/png',
      );
    });

    it('should persist logoUrl to database', async () => {
      const url = 'http://s3/bucket/tenants/tenant-uuid/logo.png';
      mockStorageService.upload.mockResolvedValue(url);
      mockPrismaService.tenant.update.mockResolvedValue({});

      await service.uploadLogo(tenantId, file);

      expect(mockPrismaService.tenant.update).toHaveBeenCalledWith({
        where: { id: tenantId },
        data: { logoUrl: url },
      });
    });

    it('should return the public URL', async () => {
      const url = 'http://s3/bucket/tenants/tenant-uuid/logo.png';
      mockStorageService.upload.mockResolvedValue(url);
      mockPrismaService.tenant.update.mockResolvedValue({});

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
      mockPrismaService.tenant.update.mockResolvedValue({});

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
  });
});
