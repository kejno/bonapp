import { EventEmitter } from 'node:events';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { IikoController } from './iiko/iiko.controller';
import { IikoService } from './iiko/iiko.service';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ close: jest.fn() })),
  Worker: jest.fn(),
}));

describe('BNP-524: unavailable iiko after retries', () => {
  it('shows unavailable on the status route only after the configured three attempts', async () => {
    const workerEvents = new EventEmitter();
    jest.mocked(Worker).mockImplementation((() => Object.assign(workerEvents, {
      close: jest.fn(),
      waitUntilReady: jest.fn(),
    })) as never);

    let persistedState: Record<string, unknown> | null = {
      status: 'RUNNING',
      startedAt: '2026-09-29T00:00:00.000Z',
    };
    const tenant = {
      findUnique: jest.fn(() => Promise.resolve({ posImportState: persistedState })),
      update: jest.fn(({ data }: { data: { posImportState: Record<string, unknown> } }) => {
        persistedState = data.posImportState;
        return Promise.resolve();
      }),
    };
    const prisma = { forTenant: () => ({ tenant }) } as unknown as PrismaService;
    const tenantContext = { getTenantId: () => 'tenant-524' } as unknown as TenantContextService;
    const service = new IikoService(
      prisma,
      tenantContext,
      { get: (_key: string, fallback: string) => fallback } as never,
    );
    const controller = new IikoController(service);

    expect(jest.mocked(Queue)).toHaveBeenCalledWith('iiko-sync-menu', expect.any(Object));
    workerEvents.emit('failed', {
      attemptsMade: 2,
      opts: { attempts: 3 },
      data: { tenantId: 'tenant-524' },
    });
    await Promise.resolve();
    expect(await controller.syncStatus()).toEqual({
      status: 'RUNNING',
      startedAt: '2026-09-29T00:00:00.000Z',
      completedAt: null,
      error: null,
    });

    workerEvents.emit('failed', {
      attemptsMade: 3,
      opts: { attempts: 3 },
      data: { tenantId: 'tenant-524' },
    });
    await new Promise((resolve) => setImmediate(resolve));

    const status = await controller.syncStatus();
    expect(status).toMatchObject({
      status: 'UNAVAILABLE',
      startedAt: '2026-09-29T00:00:00.000Z',
      error: 'iiko Cloud API недоступен после трёх попыток',
    });
    expect(typeof status.completedAt).toBe('string');
  });
});
