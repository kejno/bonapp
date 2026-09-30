import { createHash, randomUUID } from 'node:crypto';

export function createOplatiWebhookJobId(eventId?: string): string {
  return eventId ? createHash('sha256').update(eventId).digest('hex') : randomUUID();
}
