import { IikoService } from './iiko/iiko.service';
import { Queue, Worker } from 'bullmq';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ close: jest.fn() })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn(), waitUntilReady: jest.fn() })),
}));

describe('BNP-524: unavailable iiko after retries', () => {
  it('marks integration unavailable only after the configured three attempts', async () => {
    let failedHandler: ((job: { attemptsMade: number; opts: { attempts: number }; data: { tenantId: string } }) => void) | undefined;
    jest.mocked(Worker).mockImplementation((() => ({ on: (_event: string, handler: typeof failedHandler) => { failedHandler = handler; }, close: jest.fn(), waitUntilReady: jest.fn() })) as never);
    const service = new IikoService({} as never, {} as never, { get: (_key: string, fallback: string) => fallback } as never);
    expect(jest.mocked(Queue)).toHaveBeenCalledWith('iiko-sync-menu', expect.any(Object));
    expect(failedHandler).toEqual(expect.any(Function));
    const listener = failedHandler;
    const state = jest.spyOn(service as never, 'state').mockResolvedValue({ status: 'RUNNING', startedAt: '2026-09-29T00:00:00.000Z' } as never);
    const setState = jest.spyOn(service as never, 'setState').mockResolvedValue(undefined as never);
    listener?.({ attemptsMade: 2, opts: { attempts: 3 }, data: { tenantId: 'tenant-524' } });
    expect(setState).not.toHaveBeenCalled();
    listener?.({ attemptsMade: 3, opts: { attempts: 3 }, data: { tenantId: 'tenant-524' } });
    await Promise.resolve();
    await Promise.resolve();
    expect(state).toHaveBeenCalledWith('tenant-524');
    expect(setState).toHaveBeenCalledWith('tenant-524', expect.objectContaining({ status: 'UNAVAILABLE', error: 'iiko Cloud API недоступен после трёх попыток' }));
  });
});
