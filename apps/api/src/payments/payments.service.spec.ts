import { Job } from 'bullmq';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { MenuGateway } from '../menu/menu.gateway';

declare global {
  var oplatiWebhookProcessor: ((job: Job<unknown>) => Promise<void>) | undefined;
}

jest.mock('bullmq', () => {
  const actual = jest.requireActual<typeof import('bullmq')>('bullmq');
  return {
    ...actual,
    Queue: class {
      add() { return Promise.resolve(undefined); }
      close() { return Promise.resolve(undefined); }
    },
    Worker: class {
      constructor(_name: string, processor: (job: Job<unknown>) => Promise<void>) {
        globalThis.oplatiWebhookProcessor = processor;
      }
      on() { return this; }
      waitUntilReady() { return Promise.resolve(undefined); }
      close() { return Promise.resolve(undefined); }
    },
  };
});

describe('PaymentsService webhook delivery', () => {
  it('keeps an early webhook retryable until its provider transaction ID is linked', async () => {
    const prisma = {
      unscopedClient: { payment: { findFirst: jest.fn().mockResolvedValue(null) } },
    } as unknown as PrismaService;
    const config = { get: (_key: string, fallback?: string) => fallback } as never;
    const gateway = {} as MenuGateway;
    const service = new PaymentsService(prisma, config, gateway);
    const processor = globalThis.oplatiWebhookProcessor;
    if (!processor) throw new Error('BullMQ worker processor was not registered');

    await expect(processor({
      data: { body: { providerTransactionId: 'provider-payment-1', status: 'COMPLETED' } },
    } as Job<unknown>)).rejects.toThrow('BullMQ повторит обработку');

    await service.onModuleDestroy();
  });
});
