import { createOplatiWebhookJobId } from './oplati-webhook-job-id';

describe('createOplatiWebhookJobId', () => {
  it('deduplicates deliveries only when the provider supplies an event ID', () => {
    expect(createOplatiWebhookJobId('event-1')).toBe(createOplatiWebhookJobId('event-1'));
    expect(createOplatiWebhookJobId()).not.toBe(createOplatiWebhookJobId());
  });
});
