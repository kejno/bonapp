import { PrismaClient, PaymentStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PaymentsService } from '../src/payments/payments.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenant/tenant-context.service';

describe('payment webhook processing integration', () => {
  const db = new PrismaClient();
  const tenantContext = new TenantContextService();
  const prisma = new PrismaService(tenantContext);
  const tenantId = randomUUID();
  const orderIds = [randomUUID(), randomUUID()];
  const paymentIds = [randomUUID(), randomUUID()];
  const socket = { emitPaymentStatusChanged: jest.fn() };
  const queue = { registerHandler: jest.fn(), add: jest.fn() };
  const service = new PaymentsService(prisma, {} as never, queue as never, socket as never);

  beforeAll(async () => {
    await db.tenant.create({ data: { id: tenantId, slug: `payment-webhook-${tenantId}`, name: 'Payment Integration' } });
    const area = await db.diningArea.create({ data: { tenantId, name: 'Main' } });
    const table = await db.table.create({ data: { tenantId, areaId: area.id, tableNumber: 1, qrToken: `payment-${tenantId}` } });
    for (const [index, orderId] of orderIds.entries()) {
      await db.order.create({ data: { id: orderId, tenantId, tableId: table.id, dailyOrderNumber: index + 1, totalAmountByn: 12.5 } });
      await db.payment.create({ data: {
        id: paymentIds[index], tenantId, orderId, amountByn: 12.5, provider: 'ERIP_EPOS',
        status: PaymentStatus.PENDING,
      } });
    }
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
    await db.order.deleteMany({ where: { tenantId } });
    await db.table.deleteMany({ where: { tenantId } });
    await db.diningArea.deleteMany({ where: { tenantId } });
    await db.tenant.deleteMany({ where: { id: tenantId } });
    await db.$disconnect();
  });

  it('marks a confirmed payment completed and its order paid', async () => {
    await service.process('ERIP', { paymentId: paymentIds[0], tenantId, status: 'confirmed' });

    await expect(db.payment.findUniqueOrThrow({ where: { id: paymentIds[0] } })).resolves.toMatchObject({ status: PaymentStatus.COMPLETED });
    await expect(db.order.findUniqueOrThrow({ where: { id: orderIds[0] } })).resolves.toMatchObject({ isPaid: true });
  });

  it('marks a failed payment failed and leaves its order unpaid', async () => {
    await service.process('ERIP', { paymentId: paymentIds[1], tenantId, status: 'failed' });

    await expect(db.payment.findUniqueOrThrow({ where: { id: paymentIds[1] } })).resolves.toMatchObject({ status: PaymentStatus.FAILED });
    await expect(db.order.findUniqueOrThrow({ where: { id: orderIds[1] } })).resolves.toMatchObject({ isPaid: false });
  });
});
