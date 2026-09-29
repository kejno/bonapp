import { bepaidWebhookJobOptions } from './bepaid-webhook';

describe('bePaid webhook queue policy', () => {
  it('retries transient failures and permits a repeated delivery after exhaustion', () => {
    expect(bepaidWebhookJobOptions).toEqual({
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
  });
});
