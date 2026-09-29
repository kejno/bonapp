import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { IikoController } from './iiko.controller';
import { IikoModule } from './iiko.module';
import { OnboardingModule } from '../../onboarding/onboarding.module';
import { PosSyncController } from '../../onboarding/pos-sync.controller';

describe('POS menu sync routes', () => {
  it('registers one POST sync route and keeps iiko status polling', () => {
    const registeredControllers = [IikoModule, OnboardingModule]
      .flatMap((module) => Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module) as Array<{ prototype: object }>);
    const syncRoutes = registeredControllers.flatMap((controller) =>
      Object.getOwnPropertyNames(controller.prototype)
        .map((name) => Object.getOwnPropertyDescriptor(controller.prototype, name)?.value as object | undefined)
        .filter((method): method is object =>
          method !== undefined && Reflect.getMetadata(PATH_METADATA, method) === 'sync-menu',
        ),
    );

    expect(syncRoutes).toHaveLength(1);
    const [syncRoute] = syncRoutes;
    if (!syncRoute) throw new Error('Expected a registered sync route');
    expect(Reflect.getMetadata(METHOD_METADATA, syncRoute)).toBe(1);
    expect(Reflect.getMetadata(PATH_METADATA, PosSyncController)).toBe('admin/pos');

    const syncStatus = Object.getOwnPropertyDescriptor(IikoController.prototype, 'syncStatus')?.value as object;
    expect(Reflect.getMetadata(PATH_METADATA, syncStatus)).toBe('sync-status');
    expect(Reflect.getMetadata(METHOD_METADATA, syncStatus)).toBe(0);
  });
});
