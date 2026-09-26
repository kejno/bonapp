import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { MenuGateway } from '../menu/menu.gateway';

const mockTenantService = {
  uploadLogo: jest.fn(),
};
const mockMenuGateway = { emitServiceModeChanged: jest.fn() };

describe('TenantController', () => {
  let controller: TenantController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantController],
      providers: [
        { provide: TenantService, useValue: mockTenantService },
        { provide: MenuGateway, useValue: mockMenuGateway },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('test-jwt-secret'),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            forTenant: () => ({
              user: {
                findFirst: jest.fn().mockResolvedValue({ mustChangePassword: false }),
              },
            }),
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

      const result = await controller.uploadLogo(file, { user: { tenantId } } as never);

      expect(result).toEqual({ logoUrl: url });
    });

    it('should call tenantService.uploadLogo with tenantId and file', async () => {
      mockTenantService.uploadLogo.mockResolvedValue('url');

      await controller.uploadLogo(file, { user: { tenantId } } as never);

      expect(mockTenantService.uploadLogo).toHaveBeenCalledWith(tenantId, file);
    });

    it('uses the authenticated tenant id', async () => {
      await expect(
        controller.uploadLogo(file, { user: { tenantId } } as never),
      ).resolves.toEqual({ logoUrl: 'url' });
    });

    it('should propagate service errors', async () => {
      mockTenantService.uploadLogo.mockRejectedValue(new Error('storage error'));

      await expect(
        controller.uploadLogo(file, { user: { tenantId } } as never),
      ).rejects.toThrow('storage error');
    });
  });
});
