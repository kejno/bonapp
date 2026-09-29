import { PaymentQueue } from './payment-queue';
import { PaymentsService } from './payments.service';

const queueNames: string[] = [];
const workerNames: string[] = [];

jest.mock('bullmq', () => ({
  Queue: class {
    constructor(name: string) { queueNames.push(name); }
    add = jest.fn();
    close = jest.fn();
  },
  Worker: class {
    constructor(name: string) { workerNames.push(name); }
    on = jest.fn();
    waitUntilReady = jest.fn();
    close = jest.fn();
  },
}));

jest.mock('ioredis', () => ({
  __esModule: true,
  default: class {
    duplicate() { return this; }
    quit = jest.fn();
  },
}));

describe('payment webhook queue wiring', () => {
  beforeEach(() => {
    queueNames.length = 0;
    workerNames.length = 0;
  });

  it('binds each payment producer and worker to its own compatible queue', () => {
    const providerConfig = { get: jest.fn().mockReturnValue('redis://localhost:6379') };
    const providerQueue = new PaymentQueue(providerConfig as never);
    providerQueue.onModuleInit();

    const oplatiConfig = { get: jest.fn((_key: string, fallback?: string) => fallback ?? 'redis://localhost:6379') };
    new PaymentsService({} as never, oplatiConfig as never, {} as never);

    expect(queueNames).toEqual(['provider-payment-webhooks', 'payment-webhooks']);
    expect(workerNames).toEqual(['provider-payment-webhooks', 'payment-webhooks']);
    expect(new Set(queueNames).size).toBe(2);
    expect(new Set(workerNames).size).toBe(2);
  });
});
