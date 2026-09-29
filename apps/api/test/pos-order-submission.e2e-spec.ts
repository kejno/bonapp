import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { claimPosOrderSubmission } from '../src/onboarding/pos-order-recovery';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenant/tenant-context.service';

describe('POS order submission claim integration', () => {
  const db = new PrismaClient();
  const prisma = new PrismaService(new TenantContextService());
  const tenantId = randomUUID();
  let orderId: string;

  beforeAll(async () => {
    await db.tenant.create({ data: { id: tenantId, slug: `pos-claim-${tenantId}`, name: 'POS Claim Integration' } });
    const area = await db.diningArea.create({ data: { tenantId, name: 'Main' } });
    const table = await db.table.create({ data: { tenantId, areaId: area.id, tableNumber: 1, qrToken: `pos-claim-${tenantId}` } });
    const order = await db.order.create({ data: { tenantId, tableId: table.id, dailyOrderNumber: 1 } });
    orderId = order.id;
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
    await db.order.deleteMany({ where: { tenantId } });
    await db.table.deleteMany({ where: { tenantId } });
    await db.diningArea.deleteMany({ where: { tenantId } });
    await db.tenant.deleteMany({ where: { id: tenantId } });
    await db.$disconnect();
  });

  it('allows only one concurrent submission claim for an order', async () => {
    const claims = await Promise.all([
      claimPosOrderSubmission(prisma, tenantId, orderId),
      claimPosOrderSubmission(prisma, tenantId, orderId),
    ]);

    expect(claims.sort()).toEqual([false, true]);
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.posOrderSubmittedAt).toBeInstanceOf(Date);
  });
});
