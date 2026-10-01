import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SuperadminService } from './superadmin.service';

type QueryMock = jest.Mock<Promise<unknown>, [Record<string, unknown>]>;
type PrismaDouble = {
  unscopedClient: {
    tenant: { findMany: QueryMock; count: QueryMock; update: QueryMock; findUnique: QueryMock };
    order: { count: QueryMock };
  };
};

describe('SuperadminService', () => {
  const tenant = { id: 't1', name: 'Cafe', slug: 'cafe', subscriptionPlan: 'PRO', isActive: true, trialEndsAt: null };
  let prisma: PrismaDouble;
  let service: SuperadminService;

  beforeEach(() => {
    const query = () => jest.fn<Promise<unknown>, [Record<string, unknown>]>().mockResolvedValue([]);
    prisma = {
      unscopedClient: {
        tenant: { findMany: query().mockResolvedValue([tenant]), count: query().mockResolvedValue(2), update: query().mockResolvedValue(tenant), findUnique: query().mockResolvedValue(tenant) },
        order: { count: query().mockResolvedValue(3) },
      },
    };
    const config = { get: (key: string) => ({ PLAN_STANDARD_PRICE_BYN: '50', PLAN_PRO_PRICE_BYN: '100', PLAN_ENTERPRISE_PRICE_BYN: '200' })[key] } as ConfigService;
    service = new SuperadminService(prisma as unknown as PrismaService, config);
  });

  it('calculates plan revenue and 30 day order counts for multiple tenants', async () => {
    prisma.unscopedClient.tenant.findMany.mockResolvedValue([
      tenant,
      { ...tenant, id: 't2', subscriptionPlan: 'TRIAL', isActive: false },
    ]);
    const result = await service.listTenants();
    expect(result.map((item) => item.monthly_revenue_byn)).toEqual([100, 0]);
    expect(result[0]?.order_count_30d).toBe(3);
  });

  it('updates only supplied fields and accepts an explicit trial date', async () => {
    await service.updateTenant('t1', { subscription_plan: 'STANDARD', trial_ends_at: '2026-10-31', is_active: false });
    expect(prisma.unscopedClient.tenant.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 't1' }, data: { subscriptionPlan: 'STANDARD', trialEndsAt: new Date('2026-10-31'), isActive: false },
    }));
  });

  it('returns 404 for an unknown tenant', async () => {
    prisma.unscopedClient.tenant.findUnique.mockResolvedValue(null);
    await expect(service.updateTenant('missing', { is_active: false })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('aggregates active paid plans and platform counters', async () => {
    prisma.unscopedClient.tenant.findMany.mockResolvedValue([tenant, { ...tenant, id: 't2', subscriptionPlan: 'TRIAL' }]);
    const stats = await service.platformStats();
    expect(stats).toMatchObject({ mrr_byn: 100, total_tenants: 2, active_tenants: 2, qr_orders_today: 3 });
  });
});
