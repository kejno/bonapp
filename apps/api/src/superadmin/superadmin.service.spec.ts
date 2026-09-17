import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionPlan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SuperAdminService } from './superadmin.service';

const PRICES = { TRIAL: 0, STANDARD: 29, PRO: 79, ENTERPRISE: 199 };

const mockPrisma = {
  tenant: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  order: {
    count: jest.fn(),
  },
};

const mockConfig = {
  get: jest.fn().mockImplementation((key: string) => {
    if (key === 'planPrices') return PRICES;
    return undefined;
  }),
};

describe('SuperAdminService', () => {
  let service: SuperAdminService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuperAdminService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(SuperAdminService);
  });

  describe('getTenants', () => {
    it('returns mapped tenant list with computed fields', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        {
          id: 'tid1',
          name: 'Cafe A',
          slug: 'cafe-a',
          subscriptionPlan: SubscriptionPlan.PRO,
          isActive: true,
          trialEndsAt: null,
          _count: { orders: 42 },
        },
        {
          id: 'tid2',
          name: 'Cafe B',
          slug: 'cafe-b',
          subscriptionPlan: SubscriptionPlan.TRIAL,
          isActive: true,
          trialEndsAt: new Date('2026-10-01'),
          _count: { orders: 5 },
        },
      ]);

      const result = await service.getTenants();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'tid1',
        plan: SubscriptionPlan.PRO,
        orderCount30d: 42,
        monthlyRevenueByn: 79,
      });
      expect(result[1]).toMatchObject({
        id: 'tid2',
        plan: SubscriptionPlan.TRIAL,
        orderCount30d: 5,
        monthlyRevenueByn: 0,
      });
    });

    it('returns monthlyRevenueByn=0 for inactive tenant on paid plan', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        {
          id: 'tid1',
          name: 'Cafe A',
          slug: 'cafe-a',
          subscriptionPlan: SubscriptionPlan.STANDARD,
          isActive: false,
          trialEndsAt: null,
          _count: { orders: 0 },
        },
      ]);

      const [item] = await service.getTenants();
      expect(item.monthlyRevenueByn).toBe(0);
    });

    it('returns correct prices for all paid plans', async () => {
      const plans = [SubscriptionPlan.STANDARD, SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE];
      mockPrisma.tenant.findMany.mockResolvedValue(
        plans.map((plan, i) => ({
          id: `tid${i}`,
          name: `Cafe ${i}`,
          slug: `cafe-${i}`,
          subscriptionPlan: plan,
          isActive: true,
          trialEndsAt: null,
          _count: { orders: 0 },
        })),
      );

      const result = await service.getTenants();
      expect(result[0].monthlyRevenueByn).toBe(29);
      expect(result[1].monthlyRevenueByn).toBe(79);
      expect(result[2].monthlyRevenueByn).toBe(199);
    });
  });

  describe('patchTenant', () => {
    const updatedTenant = {
      id: 'tid1',
      name: 'Cafe A',
      slug: 'cafe-a',
      subscriptionPlan: SubscriptionPlan.PRO,
      isActive: true,
      trialEndsAt: null,
      _count: { orders: 10 },
    };

    it('updates subscription plan', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tid1' });
      mockPrisma.tenant.update.mockResolvedValue(updatedTenant);

      const result = await service.patchTenant('tid1', {
        subscriptionPlan: SubscriptionPlan.PRO,
      });

      expect(mockPrisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tid1' },
          data: { subscriptionPlan: SubscriptionPlan.PRO },
        }),
      );
      expect(result.plan).toBe(SubscriptionPlan.PRO);
      expect(result.monthlyRevenueByn).toBe(79);
    });

    it('updates trialEndsAt with ISO string', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tid1' });
      mockPrisma.tenant.update.mockResolvedValue({
        ...updatedTenant,
        trialEndsAt: new Date('2026-10-31'),
      });

      await service.patchTenant('tid1', { trialEndsAt: '2026-10-31' });

      expect(mockPrisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ trialEndsAt: new Date('2026-10-31') }),
        }),
      );
    });

    it('blocks tenant when isActive=false', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tid1' });
      mockPrisma.tenant.update.mockResolvedValue({
        ...updatedTenant,
        isActive: false,
      });

      const result = await service.patchTenant('tid1', { isActive: false });
      expect(result.isActive).toBe(false);
      expect(result.monthlyRevenueByn).toBe(0);
    });

    it('throws NotFoundException for unknown tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.patchTenant('nonexistent', { isActive: false }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPlatformStats', () => {
    it('computes MRR only from active non-trial tenants', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { subscriptionPlan: SubscriptionPlan.PRO, isActive: true },
        { subscriptionPlan: SubscriptionPlan.STANDARD, isActive: true },
        { subscriptionPlan: SubscriptionPlan.TRIAL, isActive: true },
        { subscriptionPlan: SubscriptionPlan.ENTERPRISE, isActive: false },
      ]);
      mockPrisma.order.count.mockResolvedValue(7);

      const stats = await service.getPlatformStats();

      expect(stats.mrrByn).toBe(79 + 29); // PRO + STANDARD; TRIAL=0, inactive ENTERPRISE excluded
      expect(stats.totalTenants).toBe(4);
      expect(stats.activeTenants).toBe(3);
      expect(stats.qrOrdersToday).toBe(7);
    });

    it('returns zero MRR when all tenants are on TRIAL', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { subscriptionPlan: SubscriptionPlan.TRIAL, isActive: true },
        { subscriptionPlan: SubscriptionPlan.TRIAL, isActive: true },
      ]);
      mockPrisma.order.count.mockResolvedValue(0);

      const stats = await service.getPlatformStats();
      expect(stats.mrrByn).toBe(0);
    });
  });
});
