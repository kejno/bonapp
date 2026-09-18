import { OrderStatus } from '@prisma/client';
import { OrdersEvents } from './orders.events';

describe('OrdersEvents', () => {
  it('publishes the status event to guest and tenant KDS rooms', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const events = new OrdersEvents();
    (events as unknown as { server: { to: typeof to } }).server = { to };

    events.publishStatusChanged('tenant-1', 'order-1', OrderStatus.COOKING);

    expect(to).toHaveBeenNthCalledWith(1, 'order_order-1');
    expect(to).toHaveBeenNthCalledWith(2, 'tenant_tenant-1_kitchen');
    expect(emit).toHaveBeenCalledWith('order:status_changed', { orderId: 'order-1', status: OrderStatus.COOKING });
  });
});
