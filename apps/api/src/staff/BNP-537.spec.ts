import { FiscalizationService } from './fiscalization.service';
import { PrismaService } from '../prisma/prisma.service';
import { encryptCredentials } from '../tenant/payment-credentials';

let mockWorkerProcessor: ((job: { data: { tenantId: string; paymentId: string } }) => Promise<void>) | undefined;

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ getJob: jest.fn(), add: jest.fn(), close: jest.fn() })),
  Worker: jest.fn().mockImplementation((_name: string, processor: typeof mockWorkerProcessor) => {
    mockWorkerProcessor = processor;
    return { waitUntilReady: jest.fn(), close: jest.fn(), on: jest.fn() };
  }),
}));

describe('BNP-537: успешная фискализация завершённого платежа', () => {
  it('отправляет данные платежа в СКНО и сохраняет полученный номер чека', async () => {
    const update = jest.fn().mockResolvedValue({});
    const payment = {
      id: 'payment-1',
      amountByn: '18.00',
      fiscalReceiptNumber: null,
      order: { items: [
        { itemId: 'tea', quantity: 2, unitPriceByn: '7.50' },
        { itemId: 'coffee', quantity: 1, unitPriceByn: '3.00' },
      ] },
    };
    const prisma = {
      forTenant: jest.fn().mockReturnValue({ payment: { findFirst: jest.fn().mockResolvedValue(payment), update } }),
      db: {
        tenant: { findUnique: jest.fn().mockResolvedValue({ paymentCredentials: { skno: encryptCredentials({ cashRegisterSerial: 'serial', host: 'http://cash.local', username: 'service', password: 'secret', unp: '123456789' }, 'test-secret') } }) },
        menuItem: { findMany: jest.fn().mockResolvedValue([{ id: 'tea', name: 'Tea' }, { id: 'coffee', name: 'Coffee' }]) },
      },
    } as unknown as PrismaService;
    const skno = { issueReceipt: jest.fn().mockResolvedValue('42') };
    new FiscalizationService(prisma, skno);
    const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;
    process.env.PAYMENT_CREDENTIALS_SECRET = 'test-secret';

    try {
      await mockWorkerProcessor?.({ data: { tenantId: 'tenant-1', paymentId: 'payment-1' } });

      expect(skno.issueReceipt).toHaveBeenCalledWith(expect.objectContaining({ cashRegisterSerial: 'serial' }), {
        paymentId: 'payment-1',
        amount: 18,
        items: [{ name: 'Tea', quantity: 2, price: 7.5 }, { name: 'Coffee', quantity: 1, price: 3 }],
      });
      expect(update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'payment-1' },
        data: { fiscalReceiptNumber: '42', fiscalizationStatus: 'FISCALIZED' },
      }));
    } finally {
      if (previousSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
      else process.env.PAYMENT_CREDENTIALS_SECRET = previousSecret;
    }
  });
});
