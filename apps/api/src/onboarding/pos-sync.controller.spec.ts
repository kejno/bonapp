import { BadRequestException } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PosSyncController } from './pos-sync.controller';
import { OnboardingService } from './onboarding.service';
import { IikoService } from '../integrations/iiko/iiko.service';

describe('PosSyncController route', () => {
  it('preserves the legacy iiko response for existing iiko integrations', async () => {
    const startImport = jest.fn().mockResolvedValue({ jobId: 'menu-import-1' });
    const enqueueSync = jest.fn().mockResolvedValue({ jobId: 'iiko-job-1', status: 'PENDING' });
    const controller = new PosSyncController(
      { startImport } as unknown as OnboardingService,
      { enqueueSync } as unknown as IikoService,
    );

    await expect(controller.syncMenu()).resolves.toEqual({ jobId: 'iiko-job-1', status: 'PENDING' });
    expect(enqueueSync).toHaveBeenCalledTimes(1);
    expect(startImport).not.toHaveBeenCalled();
  });

  it('falls back to the onboarding import when no legacy iiko config exists', async () => {
    const startImport = jest.fn().mockResolvedValue({ jobId: 'menu-import-1' });
    const enqueueSync = jest.fn().mockRejectedValue(new BadRequestException('Для тенанта не настроено подключение iiko'));
    const controller = new PosSyncController(
      { startImport } as unknown as OnboardingService,
      { enqueueSync } as unknown as IikoService,
    );

    await expect(controller.syncMenu()).resolves.toEqual({ jobId: 'menu-import-1' });
    expect(enqueueSync).toHaveBeenCalledTimes(1);
    expect(startImport).toHaveBeenCalledTimes(1);
  });

  it('exposes menu sync at POST /admin/pos/sync-menu', () => {
    expect(Reflect.getMetadata(PATH_METADATA, PosSyncController)).toBe('admin/pos');
    const syncMenu = Object.getOwnPropertyDescriptor(PosSyncController.prototype, 'syncMenu')?.value as object;
    expect(Reflect.getMetadata(PATH_METADATA, syncMenu)).toBe('sync-menu');
    expect(Reflect.getMetadata(METHOD_METADATA, syncMenu)).toBe(1);
  });
});
