import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { WebhooksController } from './webhooks.controller';
import { PaymentsService } from './payments.service';
import { PaymentQueue } from './payment-queue';

let redisUrl: string;
let redisContainer: string;

beforeAll(() => {
  redisContainer = docker('run', '--detach', '--rm', '--publish', '127.0.0.1::6379', 'redis:7').trim();
  const port = docker('port', redisContainer, '6379/tcp').trim().split(':').at(-1);
  if (!port) throw new Error('Could not determine the BNP-529 Redis container port.');
  redisUrl = `redis://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      docker('exec', redisContainer, 'redis-cli', 'ping');
      return;
    } catch {
      if (attempt === 29) throw new Error('BNP-529 Redis container did not become ready.');
      execFileSync('sleep', ['1']);
    }
  }
}, 40_000);

afterAll(() => {
  if (redisContainer) {
    try {
      docker('stop', redisContainer);
    } catch {
      // Cleanup must not hide a test failure.
    }
  }
});

describe('BNP-529 failed payment webhook through BullMQ', () => {
  it('processes an accepted signed webhook with the BullMQ worker and keeps its order unpaid', async () => {
    const paymentId = `bnp529-${randomUUID()}`;
    const orderId = `order-${paymentId}`;
    const tenantId = `tenant-${paymentId}`;
    const event = { paymentId, tenantId, status: 'failed' };
    const payment = { id: paymentId, orderId, tenantId, provider: 'ERIP_EPOS', status: 'PENDING', order: { tableId: 'table-1', guestSessionId: null } };
    const processed = deferred<void>();
    const tx = {
      payment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: { update: jest.fn() },
    };
    const prisma = {
      forTenant: () => ({ payment: { findUnique: jest.fn().mockResolvedValue(payment) } }),
      transactionForTenant: jest.fn((_tenant: string, work: (trx: typeof tx) => unknown) => Promise.resolve(work(tx))),
    };
    const socket = {
      emitPaymentStatusChanged: jest.fn(() => processed.resolve()),
    };
    const config = { get: (key: string) => key === 'REDIS_URL' ? redisUrl : undefined } as ConfigService;
    const queue = new PaymentQueue(config);
    let cleanupQueue: Queue | undefined;

    try {
      queue.registerHandler(() => Promise.resolve());
      queue.onModuleInit();
      const service = new PaymentsService(prisma as never, {} as never, queue, socket as never);
      const rawBody = Buffer.from(JSON.stringify(event));
      const signature = createHmac('sha256', 'secret').update(rawBody).digest('hex');
      const controller = new WebhooksController(service, { get: () => 'secret' } as never);

      await expect(controller.erip({ body: event, rawBody } as never, signature)).resolves.toEqual({ accepted: true });
      await expect(processed.promise).resolves.toBeUndefined();

      expect(tx.payment.updateMany).toHaveBeenCalledWith({
        where: { id: paymentId, status: 'PENDING' },
        data: { status: 'FAILED', payload: event },
      });
      expect(tx.order.update).not.toHaveBeenCalled();
      expect(socket.emitPaymentStatusChanged).toHaveBeenCalledWith(tenantId, 'table-1', null, {
        orderId,
        paymentId,
        status: 'FAILED',
        method: 'ERIP',
      });
      expect(socket.emitPaymentStatusChanged).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ status: 'COMPLETED' }),
      );
    } finally {
      await queue.onModuleDestroy();
      cleanupQueue = new Queue('payment-webhooks', { connection: { url: redisUrl } });
      const job = await cleanupQueue.getJob(`ERIP-${paymentId}`);
      await job?.remove();
      await cleanupQueue.close();
    }
  }, 15000);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe', timeout: 120_000 });
}
