import { Test } from '@nestjs/testing';
import { TenantSettingsController } from './tenant-settings.controller';
import { TenantSettingsService } from './tenant-settings.service';

describe('TenantSettingsController', () => {
  let controller: TenantSettingsController;
  let service: { updateSettings: jest.Mock };

  beforeEach(async () => {
    service = { updateSettings: jest.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      controllers: [TenantSettingsController],
      providers: [{ provide: TenantSettingsService, useValue: service }],
    }).compile();
    controller = module.get(TenantSettingsController);
  });

  it('delegates to service with tenantId and dto', async () => {
    const dto = { iikoApiUrl: 'http://iiko.local', iikoLogin: 'admin' };

    await controller.updateSettings('t1', dto);

    expect(service.updateSettings).toHaveBeenCalledWith('t1', dto);
  });

  it('returns undefined on success', async () => {
    const result = await controller.updateSettings('t1', { oplatyMerchantId: 'M-1' });
    expect(result).toBeUndefined();
  });
});
