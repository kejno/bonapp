import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';

describe('order Prisma schema', () => {
  it('exposes the order and payment status enums', () => {
    expect(OrderStatus.NEW).toBe('NEW');
    expect(PaymentMethod.OPLATI_QR).toBe('OPLATI_QR');
    expect(PaymentStatus.SUCCEEDED).toBe('SUCCEEDED');
  });
});
