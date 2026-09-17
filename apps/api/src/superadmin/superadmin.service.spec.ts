import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SuperadminService } from './superadmin.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  payment: {
    aggregate: jest.fn(),
    groupBy: jest.fn(),
    findMany: jest.fn(),
  },
  tenant: {
    count: jest.fn(),
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
  order: {
    count: jest.fn(),
  },
};

describe('SuperadminService', () => {
  let service: SuperadminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SuperadminService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<SuperadminService>(SuperadminService);
    jest.clearAllMocks();
  });

  describe('getMetrics', () => {
    it('returns correct metrics structure', async () => {
      mockPrisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 1500 } });
      mockPrisma.tenant.count.mockResolvedValue(10);
      mockPrisma.order.count.mockResolvedValue(23);
      mockPrisma.payment.findMany.mockResolvedValue([]);

      const result = await service.getMetrics();

      expect(result.mrr).toBe(1500);
      expect(result.activeTenants).toBe(10);
      expect(result.ordersToday).toBe(23);
      expect(result.mrrHistory).toHaveLength(12);
    });

    it('returns 0 for mrr when no subscription payments', async () => {
      mockPrisma.payment.aggregate.mockResolvedValue({ _sum: { amount: null } });
      mockPrisma.tenant.count.mockResolvedValue(0);
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.payment.findMany.mockResolvedValue([]);

      const result = await service.getMetrics();

      expect(result.mrr).toBe(0);
    });

    it('builds MRR history with 12 months', async () => {
      mockPrisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      mockPrisma.tenant.count.mockResolvedValue(0);
      mockPrisma.order.count.mockResolvedValue(0);
      const now = new Date();
      const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 15);
      mockPrisma.payment.findMany.mockResolvedValue([
        { amount: 500, createdAt: twoMonthsAgo },
        { amount: 300, createdAt: twoMonthsAgo },
      ]);

      const result = await service.getMetrics();

      expect(result.mrrHistory).toHaveLength(12);
      const twoMonthEntry = result.mrrHistory[result.mrrHistory.length - 3];
      expect(twoMonthEntry.mrr).toBe(800);
    });
  });

  describe('getTenants', () => {
    const tenantFixture = {
      id: 'tid-1',
      name: 'Resto A',
      plan: 'PRO',
      status: 'ACTIVE',
      trialEndsAt: null,
      createdAt: new Date('2025-01-01'),
    };

    it('returns all tenants without filters', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([tenantFixture]);
      mockPrisma.payment.groupBy.mockResolvedValue([{ tenantId: 'tid-1', _sum: { amount: 200 } }]);

      const result = await service.getTenants({});

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.data[0].revenueLastThirtyDays).toBe(200);
    });

    it('passes plan filter to prisma query', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([]);
      mockPrisma.payment.groupBy.mockResolvedValue([]);

      await service.getTenants({ plan: 'PRO' });

      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { plan: 'PRO' } }),
      );
    });

    it('passes status filter to prisma query', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([]);
      mockPrisma.payment.groupBy.mockResolvedValue([]);

      await service.getTenants({ status: 'BLOCKED' });

      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'BLOCKED' } }),
      );
    });

    it('returns 0 revenue for tenant with no payments', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([tenantFixture]);
      mockPrisma.payment.groupBy.mockResolvedValue([]);

      const result = await service.getTenants({});

      expect(result.data[0].revenueLastThirtyDays).toBe(0);
    });

    it('handles multiple tenants correctly', async () => {
      const tenant2 = { ...tenantFixture, id: 'tid-2', name: 'Resto B' };
      mockPrisma.tenant.findMany.mockResolvedValue([tenantFixture, tenant2]);
      mockPrisma.payment.groupBy.mockResolvedValue([
        { tenantId: 'tid-1', _sum: { amount: 100 } },
        { tenantId: 'tid-2', _sum: { amount: 250 } },
      ]);

      const result = await service.getTenants({});

      expect(result.data).toHaveLength(2);
      expect(result.data[0].revenueLastThirtyDays).toBe(100);
      expect(result.data[1].revenueLastThirtyDays).toBe(250);
    });
  });

  describe('changePlan', () => {
    it('updates tenant plan', async () => {
      mockPrisma.tenant.count.mockResolvedValue(1);
      mockPrisma.tenant.update.mockResolvedValue({
        id: 'tid-1',
        name: 'Resto',
        plan: 'ENTERPRISE',
        status: 'ACTIVE',
        trialEndsAt: null,
        createdAt: new Date(),
      });

      const result = await service.changePlan('tid-1', 'ENTERPRISE');

      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tid-1' },
        data: { plan: 'ENTERPRISE' },
      });
      expect(result.plan).toBe('ENTERPRISE');
    });

    it('throws NotFoundException for unknown tenant', async () => {
      mockPrisma.tenant.count.mockResolvedValue(0);

      await expect(service.changePlan('unknown', 'PRO')).rejects.toThrow(NotFoundException);
    });
  });

  describe('blockTenant', () => {
    it('sets tenant status to BLOCKED', async () => {
      mockPrisma.tenant.count.mockResolvedValue(1);
      mockPrisma.tenant.update.mockResolvedValue({
        id: 'tid-1',
        name: 'Resto',
        plan: 'PRO',
        status: 'BLOCKED',
        trialEndsAt: null,
        createdAt: new Date(),
      });

      const result = await service.blockTenant('tid-1');

      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tid-1' },
        data: { status: 'BLOCKED' },
      });
      expect(result.status).toBe('BLOCKED');
    });
  });

  describe('unblockTenant', () => {
    it('sets tenant status to ACTIVE', async () => {
      mockPrisma.tenant.count.mockResolvedValue(1);
      mockPrisma.tenant.update.mockResolvedValue({
        id: 'tid-1',
        name: 'Resto',
        plan: 'PRO',
        status: 'ACTIVE',
        trialEndsAt: null,
        createdAt: new Date(),
      });

      const result = await service.unblockTenant('tid-1');

      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('extendTrial', () => {
    it('extends trialEndsAt by 30 days from existing date', async () => {
      const existingTrialEnd = new Date('2026-09-20T00:00:00.000Z');
      mockPrisma.tenant.count.mockResolvedValue(1);
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({
        id: 'tid-1',
        trialEndsAt: existingTrialEnd,
      });
      mockPrisma.tenant.update.mockImplementation(({ data }) => Promise.resolve({
        id: 'tid-1',
        name: 'Resto',
        plan: 'TRIAL',
        status: 'TRIAL',
        trialEndsAt: data.trialEndsAt,
        createdAt: new Date(),
      }));

      const result = await service.extendTrial('tid-1');

      const expected = new Date('2026-10-20T00:00:00.000Z');
      expect(new Date(result.trialEndsAt!).getTime()).toBe(expected.getTime());
    });

    it('uses current date as base when trialEndsAt is null', async () => {
      mockPrisma.tenant.count.mockResolvedValue(1);
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({ id: 'tid-1', trialEndsAt: null });
      mockPrisma.tenant.update.mockImplementation(({ data }) => Promise.resolve({
        id: 'tid-1',
        name: 'Resto',
        plan: 'TRIAL',
        status: 'TRIAL',
        trialEndsAt: data.trialEndsAt,
        createdAt: new Date(),
      }));

      const before = new Date();
      const result = await service.extendTrial('tid-1');
      const after = new Date();

      const trialDate = new Date(result.trialEndsAt!);
      expect(trialDate.getTime()).toBeGreaterThanOrEqual(before.getTime() + 30 * 24 * 60 * 60 * 1000 - 1000);
      expect(trialDate.getTime()).toBeLessThanOrEqual(after.getTime() + 30 * 24 * 60 * 60 * 1000 + 1000);
    });
  });
});
