import { PROVIDER_PAYMENT_WEBHOOK_QUEUE } from './payment-queue';
import { OPLATI_PAYMENT_WEBHOOK_QUEUE } from './payment-webhook-queues';

describe('PaymentQueue', () => {
  it('uses a dedicated queue for ERIP and bePaid webhooks', () => {
    expect(PROVIDER_PAYMENT_WEBHOOK_QUEUE).toBe('provider-payment-webhooks');
    expect(OPLATI_PAYMENT_WEBHOOK_QUEUE).toBe('payment-webhooks');
    expect(PROVIDER_PAYMENT_WEBHOOK_QUEUE).not.toBe(OPLATI_PAYMENT_WEBHOOK_QUEUE);
  });
});
