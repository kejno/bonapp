import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { encryptCredentials } from '../tenant/payment-credentials';
import { FiscalizationService } from './fiscalization.service';

describe('BNP-538: исчерпание попыток фискализации', () => {
  jest.setTimeout(90_000);

  it('повторяет BullMQ-задачу после отказа СКНО и помечает платёж после трёх попыток', async () => {
    const redisContainer = execFileSync('docker', [
      'run', '--detach', '--rm', '--publish', '127.0.0.1::6379', 'redis:7',
    ], { encoding: 'utf8' }).trim();
    const previousRedisHost = process.env.REDIS_HOST;
    const previousRedisPort = process.env.REDIS_PORT;
    const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;
    let service: FiscalizationService | undefined;
    let logger: jest.SpyInstance | undefined;

    try {
      const redisPort = execFileSync('docker', ['port', redisContainer, '6379/tcp'], { encoding: 'utf8' }).trim().split(':').at(-1)!;
      process.env.REDIS_HOST = '127.0.0.1';
      process.env.REDIS_PORT = redisPort;
      process.env.PAYMENT_CREDENTIALS_SECRET = 'test-secret';

      const paymentUpdate = jest.fn().mockResolvedValue({ count: 1 });
      const paymentSave = jest.fn();
      const payment = {
        id: randomUUID(),
        amountByn: '18.00',
        fiscalReceiptNumber: null,
        order: { items: [{ itemId: 'tea', quantity: 1, unitPriceByn: '18.00' }] },
      };
      const prisma = {
        transactionForTenant: jest.fn((_tenantId: string, operation: (tx: unknown) => unknown) =>
          Promise.resolve(operation({ payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } })),
        ),
        forTenant: jest.fn().mockReturnValue({
          payment: { findFirst: jest.fn().mockResolvedValue(payment), update: paymentSave, updateMany: paymentUpdate },
        }),
        db: {
          tenant: { findUnique: jest.fn().mockResolvedValue({ paymentCredentials: { skno: encryptCredentials({
            cashRegisterSerial: 'serial', host: 'http://cash.local', username: 'service', password: 'secret', unp: '123456789',
          }, 'test-secret') } }) },
          menuItem: { findMany: jest.fn().mockResolvedValue([{ id: 'tea', name: 'Tea' }]) },
        },
      } as unknown as PrismaService;
      const callTimes: number[] = [];
      const skno = { issueReceipt: jest.fn().mockImplementation(() => {
        callTimes.push(Date.now());
        return Promise.reject(new Error('SKNO unavailable'));
      }) };
      service = new FiscalizationService(prisma, skno);
      logger = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await service.onModuleInit();
      await service.enqueue('tenant-1', payment.id);
      const deadline = Date.now() + 80_000;
      while (paymentUpdate.mock.calls.length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      expect(skno.issueReceipt).toHaveBeenCalledTimes(3);
      expect(callTimes[1] - callTimes[0]).toBeGreaterThanOrEqual(4_900);
      expect(callTimes[2] - callTimes[1]).toBeGreaterThanOrEqual(29_900);
      expect(paymentUpdate).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: payment.id, fiscalReceiptNumber: null },
        data: { fiscalizationStatus: 'FISCAL_FAILED' },
      }));
      expect(paymentSave).not.toHaveBeenCalled();
      expect(payment.fiscalReceiptNumber).toBeNull();
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('исчерпала три попытки'), expect.any(String));
    } finally {
      try {
        if (service) await service.onModuleDestroy();
      } finally {
        logger?.mockRestore();
        if (previousRedisHost === undefined) delete process.env.REDIS_HOST;
        else process.env.REDIS_HOST = previousRedisHost;
        if (previousRedisPort === undefined) delete process.env.REDIS_PORT;
        else process.env.REDIS_PORT = previousRedisPort;
        if (previousSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
        else process.env.PAYMENT_CREDENTIALS_SECRET = previousSecret;
        execFileSync('docker', ['stop', redisContainer], { stdio: 'pipe' });
      }
    }
  });
});
