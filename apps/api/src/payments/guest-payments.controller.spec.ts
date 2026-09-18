import { GuestPaymentsController } from './guest-payments.controller';
import { GuestPaymentsService } from './guest-payments.service';

describe('GuestPaymentsController', () => {
  it('creates an Oplati payment session for an order', () => {
    const controller = new GuestPaymentsController(new GuestPaymentsService());

    const payment = controller.createOplatiPayment('order-1');

    expect(payment.qrCodeData).toBe('oplati://pay/order-1');
    expect(payment.deepLink).toBe('oplati://pay/order-1');
    expect(payment.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
