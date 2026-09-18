import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantSettingsService } from './tenant-settings.service';

const makePrisma = () => ({
  tenantSettings: {
    upsert: jest.fn().mockResolvedValue({}),
  },
});

describe('TenantSettingsService', () => {
  let service: TenantSettingsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module = await Test.createTestingModule({
      providers: [
        TenantSettingsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(TenantSettingsService);
  });

  it('upserts a single field', async () => {
    await service.updateSettings('t1', { iikoApiUrl: 'http://iiko.local' });

    expect(prisma.tenantSettings.upsert).toHaveBeenCalledWith({
      where: { tenantId: 't1' },
      update: { iikoApiUrl: 'http://iiko.local' },
      create: { tenantId: 't1', iikoApiUrl: 'http://iiko.local' },
    });
  });

  it('upserts multiple fields in one call', async () => {
    const dto = { bePaidShopId: 'S-999', bePaidSecretKey: 'sk', bePaidMode: 'prod' as const };
    await service.updateSettings('t1', dto);

    expect(prisma.tenantSettings.upsert).toHaveBeenCalledWith({
      where: { tenantId: 't1' },
      update: dto,
      create: { tenantId: 't1', ...dto },
    });
  });

  it('upserts iiko credentials', async () => {
    const dto = { iikoApiUrl: 'http://iiko.local', iikoLogin: 'admin', iikoPassword: 'secret' };
    await service.updateSettings('tenant-abc', dto);

    expect(prisma.tenantSettings.upsert).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-abc' },
      update: dto,
      create: { tenantId: 'tenant-abc', ...dto },
    });
  });
});
