import { PosOrderQueueService } from './pos-order-queue.service';

describe('BNP-520: preserve a guest order when r_keeper is unavailable', () => {
  it('logs queue submission errors without propagating them to order creation', async () => {
    const service = Object.create(PosOrderQueueService.prototype) as PosOrderQueueService;
    const logger = { error: jest.fn() };
    Object.defineProperty(service, 'logger', { value: logger });
    jest.spyOn(service as unknown as { addOrderJob: (tenantId: string, orderId: string) => Promise<void> }, 'addOrderJob')
      .mockRejectedValue(new Error('Redis unavailable'));

    await expect(service.enqueue('tenant-520', 'order-520')).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      'Не удалось поставить заказ order-520 в очередь POS',
      expect.any(String),
    );
  });
});
