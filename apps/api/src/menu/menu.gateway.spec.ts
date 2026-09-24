import type { HttpAdapterHost } from '@nestjs/core';
import { MenuGateway } from './menu.gateway';

describe('MenuGateway', () => {
  function makeGateway() {
    const gateway = new MenuGateway({} as HttpAdapterHost);
    const emitFn = jest.fn();
    const toFn = jest.fn().mockReturnValue({ emit: emitFn });
    (gateway as unknown as Record<string, unknown>)['io'] = { to: toFn };
    return { gateway, toFn, emitFn };
  }

  it('emits menu:stop_list_changed to the correct tenant room', () => {
    const { gateway, toFn, emitFn } = makeGateway();

    gateway.emitStopListChanged('tenant-1', 'item-42', true);

    expect(toFn).toHaveBeenCalledWith('tenant:tenant-1');
    expect(emitFn).toHaveBeenCalledWith('menu:stop_list_changed', {
      itemId: 'item-42',
      isInStopList: true,
    });
  });

  it('emits isInStopList false when the item is removed from the stop list', () => {
    const { gateway, emitFn } = makeGateway();

    gateway.emitStopListChanged('tenant-1', 'item-42', false);

    expect(emitFn).toHaveBeenCalledWith('menu:stop_list_changed', {
      itemId: 'item-42',
      isInStopList: false,
    });
  });

  it('routes events to separate rooms for different tenants', () => {
    const { gateway, toFn } = makeGateway();

    gateway.emitStopListChanged('tenant-a', 'item-1', true);
    gateway.emitStopListChanged('tenant-b', 'item-2', false);

    expect(toFn).toHaveBeenCalledWith('tenant:tenant-a');
    expect(toFn).toHaveBeenCalledWith('tenant:tenant-b');
    expect(toFn).toHaveBeenCalledTimes(2);
  });
});
