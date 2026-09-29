import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

const ACTIVE_ORDER_STATUSES = ['NEW', 'COOKING', 'READY', 'SERVED'] as const;

export function isPosOrderEligible(status: string, isPaid: boolean): boolean {
  return !isPaid && ACTIVE_ORDER_STATUSES.includes(status as (typeof ACTIVE_ORDER_STATUSES)[number]);
}

export async function recoverPendingPosOrders(
  store: PrismaService,
  enqueue: (tenantId: string, orderId: string) => Promise<void>,
): Promise<void> {
  const tenants = await store.db.tenant.findMany({
    where: {
      posType: { in: ['iiko', 'r_keeper'] },
      posUrl: { not: null },
      OR: [{ posApiKey: { not: null } }, { posCredentials: { not: Prisma.DbNull } }],
    },
    select: { id: true },
  });
  for (const tenant of tenants) {
    let cursor: { id: string } | undefined;
    let pending: Array<{ id: string }>;
    do {
      pending = await store.forTenant(tenant.id).order.findMany({
        where: {
          tenantId: tenant.id,
          guestSessionId: { not: null },
          posOrderId: null,
          isPaid: false,
          status: { in: [...ACTIVE_ORDER_STATUSES] },
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: 100,
        ...(cursor ? { cursor, skip: 1 } : {}),
      });
      for (const order of pending) await enqueue(tenant.id, order.id);
      const lastOrder = pending.at(-1);
      cursor = lastOrder ? { id: lastOrder.id } : undefined;
    } while (pending.length === 100);
  }
}
