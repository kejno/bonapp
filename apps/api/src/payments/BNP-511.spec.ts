import { createHmac } from 'node:crypto';
import { WebhooksController } from './webhooks.controller';

describe('BNP-511 webhook signature verification', () => {
  it('rejects an invalid signature without queuing or changing payment data', async () => {
    const payments = { enqueue: jest.fn() };
    const controller = new WebhooksController(payments as never, { get: () => 'secret' } as never);
    const rawBody = Buffer.from('{"paymentId":"p1","status":"confirmed"}');
    await expect(controller.erip({ body: JSON.parse(rawBody.toString()) as Record<string, unknown>, rawBody } as never, '0'.repeat(64))).rejects.toThrow('Invalid webhook signature');
    expect(payments.enqueue).not.toHaveBeenCalled();
  });

  it('accepts a correctly signed event for queue processing', async () => {
    const payments = { enqueue: jest.fn() };
    const controller = new WebhooksController(payments as never, { get: () => 'secret' } as never);
    const rawBody = Buffer.from('{"paymentId":"p1","status":"confirmed"}');
    const signature = createHmac('sha256', 'secret').update(rawBody).digest('hex');
    await expect(controller.erip({ body: JSON.parse(rawBody.toString()) as Record<string, unknown>, rawBody } as never, signature)).resolves.toEqual({ accepted: true });
    expect(payments.enqueue).toHaveBeenCalledWith('ERIP', expect.objectContaining({ paymentId: 'p1' }));
  });
});
