import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PosSyncController } from './pos-sync.controller';
import { OnboardingService } from './onboarding.service';

describe('PosSyncController route', () => {
  it('starts the configured POS import through onboarding', async () => {
    const startImport = jest.fn().mockResolvedValue({ jobId: 'menu-import-1' });
    const controller = new PosSyncController({ startImport } as unknown as OnboardingService);

    await expect(controller.syncMenu()).resolves.toEqual({ jobId: 'menu-import-1' });
    expect(startImport).toHaveBeenCalledTimes(1);
  });

  it('exposes menu sync at POST /admin/pos/sync-menu', () => {
    expect(Reflect.getMetadata(PATH_METADATA, PosSyncController)).toBe('admin/pos');
    const syncMenu = Object.getOwnPropertyDescriptor(PosSyncController.prototype, 'syncMenu')?.value as object;
    expect(Reflect.getMetadata(PATH_METADATA, syncMenu)).toBe('sync-menu');
    expect(Reflect.getMetadata(METHOD_METADATA, syncMenu)).toBe(1);
  });
});
