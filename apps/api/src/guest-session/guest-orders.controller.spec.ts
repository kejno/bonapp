import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { GuestOrdersController } from './guest-orders.controller';
import { GuestSessionService } from './guest-session.service';

describe('GuestOrdersController card payment', () => {
  const createCardPayment = jest.fn();
  const controller = new GuestOrdersController({ createCardPayment } as unknown as GuestSessionService);
  const request = { tenantId: 'tenant-1', tableId: 'table-1' } as unknown as Request;

  beforeEach(() => jest.clearAllMocks());

  it('forwards the validated tip amount to card payment creation', () => {
    void controller.createCardPayment(request, 'order-1', { tipsAmountByn: 4.75 });

    expect(createCardPayment).toHaveBeenCalledWith('order-1', 'tenant-1', 'table-1', 4.75);
  });

  it.each([0.29, 0.57])('accepts a valid tip amount of %s BYN', (tipsAmountByn) => {
    void controller.createCardPayment(request, 'order-1', { tipsAmountByn });

    expect(createCardPayment).toHaveBeenCalledWith('order-1', 'tenant-1', 'table-1', tipsAmountByn);
  });

  it.each([-1, 1.005, Number.NaN, Number.POSITIVE_INFINITY, '4.75'])('rejects invalid tip amount %s', (tipsAmountByn) => {
    expect(() => controller.createCardPayment(request, 'order-1', { tipsAmountByn })).toThrow(BadRequestException);
    expect(createCardPayment).not.toHaveBeenCalled();
  });
});

describe('GuestOrdersController guest order creation', () => {
  const createGuestOrder = jest.fn();
  const controller = new GuestOrdersController({ createGuestOrder } as unknown as GuestSessionService);
  const request = {
    tenantId: 'tenant-1',
    tableId: 'table-1',
    headers: { 'x-qr-token': 'table-session-token' },
  } as unknown as Request;

  beforeEach(() => jest.clearAllMocks());

  it('creates an order using the authorized header token without requiring it in the body', () => {
    const body = {
      comment: 'Без лука',
      items: [{ menuItemId: 'menu-item-1', quantity: 2, selectedModifiers: [] }],
    };

    void controller.createOrder(request, body);

    expect(createGuestOrder).toHaveBeenCalledWith('tenant-1', 'table-1', {
      comment: 'Без лука',
      guestSessionId: null,
      items: [{ menuItemId: 'menu-item-1', quantity: 2, selectedModifiers: [] }],
    });
  });
});
