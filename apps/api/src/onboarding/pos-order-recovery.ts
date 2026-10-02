import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { PosOrderRejectedError } from './pos-network';

const ACTIVE_ORDER_STATUSES = ['NEW', 'COOKING', 'READY', 'SERVED'] as const;

export function isPosOrderEligible(status: string, isPaid: boolean): boolean {
  return !isPaid && ACTIVE_ORDER_STATUSES.includes(status as (typeof ACTIVE_ORDER_STATUSES)[number]);
}

export async function claimPosOrderSubmission(store: PrismaService, tenantId: string, orderId: string): Promise<boolean> {
  const result = await store.forTenant(tenantId).order.updateMany({
    where: {
      id: orderId,
      tenantId,
      posOrderId: null,
      posOrderSubmittedAt: null,
      isPaid: false,
      status: { in: [...ACTIVE_ORDER_STATUSES] },
    },
    data: { posOrderSubmittedAt: new Date() },
  });
  return result.count === 1;
}

export async function releaseRejectedPosOrderSubmission(store: PrismaService, tenantId: string, orderId: string): Promise<void> {
  await store.forTenant(tenantId).order.updateMany({
    where: { id: orderId, tenantId, posOrderId: null, posOrderSubmittedAt: { not: null } },
    data: { posOrderSubmittedAt: null },
  });
}

export async function submitClaimedPosOrder<T>(
  store: PrismaService,
  tenantId: string,
  orderId: string,
  submit: () => Promise<T>,
): Promise<T> {
  try {
    return await submit();
  } catch (error) {
    if (error instanceof PosOrderRejectedError) {
      await releaseRejectedPosOrderSubmission(store, tenantId, orderId);
    }
    throw error;
  }
}

export async function recoverPendingPosOrders(
  store: PrismaService,
  enqueue: (tenantId: string, orderId: string) => Promise<void>,
): Promise<void> {
  // Runs from a timer, outside any request, so there is no tenant context for `store.db`.
  const tenants = await store.superadminTransaction((tx) => tx.tenant.findMany({
    where: {
      posType: { in: ['iiko', 'r_keeper'] },
      posUrl: { not: null },
      OR: [{ posApiKey: { not: null } }, { posCredentials: { not: Prisma.DbNull } }],
    },
    select: { id: true },
  }));
  for (const tenant of tenants) {
    let cursor: { id: string } | undefined;
    let pending: Array<{ id: string }>;
    do {
      pending = await store.forTenant(tenant.id).order.findMany({
        where: {
          tenantId: tenant.id,
          guestSessionId: { not: null },
          posOrderId: null,
          posOrderSubmittedAt: null,
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
