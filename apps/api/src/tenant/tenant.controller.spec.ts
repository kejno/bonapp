import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';

const mockTenantService = {
  uploadLogo: jest.fn(),
};

describe('TenantController', () => {
  let controller: TenantController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantController],
      providers: [
        { provide: TenantService, useValue: mockTenantService },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('test-jwt-secret'),
          },
        },
      ],
    }).compile();

    controller = module.get<TenantController>(TenantController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('uploadLogo', () => {
    const tenantId = 'tenant-uuid';
    const file = {
      originalname: 'logo.png',
      buffer: Buffer.from('img'),
      mimetype: 'image/png',
    } as Express.Multer.File;

    it('should return logoUrl on success', async () => {
      const url = 'http://s3/bucket/tenants/tenant-uuid/logo.png';
      mockTenantService.uploadLogo.mockResolvedValue(url);

      const result = await controller.uploadLogo(file, tenantId);

      expect(result).toEqual({ logoUrl: url });
    });

    it('should call tenantService.uploadLogo with tenantId and file', async () => {
      mockTenantService.uploadLogo.mockResolvedValue('url');

      await controller.uploadLogo(file, tenantId);

      expect(mockTenantService.uploadLogo).toHaveBeenCalledWith(tenantId, file);
    });

    it('should throw BadRequestException when tenantId is missing', async () => {
      await expect(
        controller.uploadLogo(file, ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('should propagate service errors', async () => {
      mockTenantService.uploadLogo.mockRejectedValue(new Error('storage error'));

      await expect(
        controller.uploadLogo(file, tenantId),
      ).rejects.toThrow('storage error');
    });
  });
});
