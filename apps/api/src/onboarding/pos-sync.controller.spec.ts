import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PosSyncController } from './pos-sync.controller';

describe('PosSyncController route', () => {
  it('exposes menu sync at POST /admin/pos/sync-menu', () => {
    expect(Reflect.getMetadata(PATH_METADATA, PosSyncController)).toBe('admin/pos');
    const syncMenu = Object.getOwnPropertyDescriptor(PosSyncController.prototype, 'syncMenu')?.value as object;
    expect(Reflect.getMetadata(PATH_METADATA, syncMenu)).toBe('sync-menu');
    expect(Reflect.getMetadata(METHOD_METADATA, syncMenu)).toBe(1);
  });
});
